import Anthropic from "@anthropic-ai/sdk";
import type {
  Depth,
  EvidenceFreshness,
  Hypcheck,
  HypothesisVersion,
  Metric,
  PriorRunDigest,
  RefineResult,
  RunResult,
  RunTelemetry,
} from "../types";
import { CADENCE_DAYS, DEPTH_LABELS, STANCE_LABELS } from "../types";
import { buildReportMd } from "./report";
import { Logger, logger as rootLogger } from "../logger";

// Sonnet is the default research model: ~2-3x faster than Opus at web-grounded
// synthesis, which keeps a run (incl. the industry-analysis section) well under
// Vercel's 300s function ceiling. Override with HYPCHECK_MODEL for max depth.
const MODEL = process.env.HYPCHECK_MODEL || "claude-sonnet-4-6";

const DEPTH_SEARCHES: Record<Depth, number> = { brief: 3, standard: 5, deep: 8 };
const DEPTH_TOKENS: Record<Depth, number> = { brief: 6000, standard: 12000, deep: 24000 };
// Hard backstop: abort research before the function budget (Vercel Pro + Fluid
// Compute allows up to 800s) so a runaway run falls back to a recorded result
// instead of getting killed and stuck "running". Comfortably above a normal
// ~200-300s research call; well below the 800s route budget.
const RESEARCH_ABORT_MS = Number(process.env.HYPCHECK_RESEARCH_ABORT_MS) || 600_000;

export function liveEngineAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Non-secret engine config, for the health endpoint and logs. */
export function engineInfo(): { model: string; hasKey: boolean } {
  return { model: MODEL, hasKey: liveEngineAvailable() };
}

export type LiveTelemetry = Pick<RunTelemetry, "inputTokens" | "outputTokens" | "searches">;
export interface LiveRunOutput {
  result: RunResult;
  telemetry: LiveTelemetry;
  /** The instant the run was assessed — persist this so the report body's date matches `runAt`. */
  runAt: Date;
}

function webSearchRequests(usage: Anthropic.Usage): number | null {
  const serverToolUse = (usage as unknown as { server_tool_use?: { web_search_requests?: number } }).server_tool_use;
  return serverToolUse?.web_search_requests ?? null;
}

function client(): Anthropic {
  return new Anthropic();
}

const RESULT_SCHEMA = {
  type: "object",
  properties: {
    pmfScore: { type: "number", description: "Overall product-market-fit score, 0-100" },
    confidence: { type: "number", description: "Confidence in the assessment, 0-1" },
    execSummary: {
      type: "string",
      description: "3-4 sentence executive summary of this period's findings, written for a product manager",
    },
    metricScores: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Metric name, exactly as provided" },
          score: { type: "number", description: "0-100 score for this metric" },
          note: { type: "string", description: "2-3 sentence evidence-based justification" },
          freshness: {
            type: "string",
            enum: ["fresh", "stale", "none"],
            description:
              "Age of the NEWEST evidence supporting this score: 'fresh' if inside the freshness window, 'stale' if only older evidence was found, 'none' if no usable evidence was found",
          },
        },
        required: ["name", "score", "note", "freshness"],
        additionalProperties: false,
      },
    },
    insights: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          body: { type: "string", description: "2-4 sentences; concrete and evidence-based" },
          direction: { type: "string", enum: ["supporting", "challenging", "watch"] },
          proposedRevision: {
            type: ["string", "null"],
            description:
              "If this insight warrants amending the hypothesis, the complete revised hypothesis statement; otherwise null",
          },
        },
        required: ["title", "body", "direction", "proposedRevision"],
        additionalProperties: false,
      },
    },
    industryAnalysis: {
      type: "object",
      description: "Analyst-grade industry briefing (the '## Industry Analysis' section of the report), captured structured",
      properties: {
        headline: { type: "string", description: "BLUF: the single most important industry takeaway, 1-2 sentences" },
        stance: {
          type: "string",
          enum: ["accelerate", "advance", "hold", "reposition", "retreat"],
          description: "The analyst's call — the action the industry context implies for this hypothesis",
        },
        conviction: { type: "string", enum: ["low", "moderate", "high"] },
        landscape: { type: "string", description: "Market structure, lifecycle stage, and momentum" },
        competitiveDynamics: { type: "string", description: "Moves by watchlist players and adjacent entrants; whitespace" },
        catalysts: { type: "array", items: { type: "string" }, description: "2-4 recent or upcoming events that move the market" },
        implications: { type: "string", description: "The 'so what' for this hypothesis" },
      },
      required: ["headline", "stance", "conviction", "landscape", "competitiveDynamics", "catalysts", "implications"],
      additionalProperties: false,
    },
    risks: { type: "array", items: { type: "string" } },
    actions: { type: "array", items: { type: "string" } },
    watchlistNotes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          note: { type: "string" },
        },
        required: ["name", "note"],
        additionalProperties: false,
      },
    },
    changesSinceLastRun: {
      type: ["string", "null"],
      description:
        "2-4 sentences on what materially changed since the previous run — new events, metric movements, and why. Null if there is no previous run.",
    },
    sources: {
      type: "array",
      description: "Every web source cited anywhere in the report",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          url: { type: "string" },
          publishedAt: {
            type: ["string", "null"],
            description: "Publication date of the source as YYYY-MM-DD if known, else null. Never guess.",
          },
        },
        required: ["title", "url", "publishedAt"],
        additionalProperties: false,
      },
    },
  },
  required: ["pmfScore", "confidence", "execSummary", "metricScores", "industryAnalysis", "insights", "risks", "actions", "watchlistNotes", "changesSinceLastRun", "sources"],
  additionalProperties: false,
} as const;

const STANCES = ["accelerate", "advance", "hold", "reposition", "retreat"] as const;
const CONVICTIONS = ["low", "moderate", "high"] as const;

interface StructuredResult {
  pmfScore: number;
  confidence: number;
  execSummary: string;
  changesSinceLastRun: string | null;
  metricScores: Array<{ name: string; score: number; note: string; freshness: EvidenceFreshness }>;
  industryAnalysis: {
    headline: string;
    stance: (typeof STANCES)[number];
    conviction: (typeof CONVICTIONS)[number];
    landscape: string;
    competitiveDynamics: string;
    catalysts: string[];
    implications: string;
  };
  insights: Array<{ title: string; body: string; direction: "supporting" | "challenging" | "watch"; proposedRevision: string | null }>;
  risks: string[];
  actions: string[];
  watchlistNotes: Array<{ name: string; note: string }>;
  sources: Array<{ title: string; url: string; publishedAt: string | null }>;
}

const FRESHNESS_VALUES: readonly EvidenceFreshness[] = ["fresh", "stale", "none"];

export type PhaseReporter = (phase: string, extra?: Record<string, unknown>) => void | Promise<void>;

export async function liveRun(
  hypcheck: Hypcheck,
  version: HypothesisVersion,
  metrics: Metric[],
  prior: PriorRunDigest | null,
  log: Logger = rootLogger,
  onPhase?: PhaseReporter
): Promise<LiveRunOutput> {
  const anthropic = client();
  const runDate = new Date();

  // Freshness window: everything since the previous run is "new to this
  // hypcheck" (a long pause widens the window accordingly); first runs get
  // 2x the cadence so there is enough recent material to score against.
  const windowDays = prior
    ? Math.max(1, Math.ceil((runDate.getTime() - new Date(prior.runAt).getTime()) / 86_400_000))
    : CADENCE_DAYS[hypcheck.cadence] * 2;

  const priorSection = prior
    ? [
        `## Previous run (${prior.runAt.slice(0, 10)}, hypothesis v${prior.hypothesisVersion}) — scored ${prior.pmfScore}/100${prior.stance ? `, analyst's call: ${STANCE_LABELS[prior.stance]}` : ""}`,
        `Per-metric scores from that run:`,
        ...prior.metricScores.map((ms) => `- ${ms.name}: ${Math.round(ms.score)}/100${ms.carriedForward ? " (carried forward)" : ""} — ${ms.note}`),
        ...(prior.openInsightTitles.length
          ? [`Insights still under review by the product manager:`, ...prior.openInsightTitles.map((t) => `- ${t}`)]
          : []),
        `Score consistently against these values: where nothing fresh emerged, say so rather than re-litigating old evidence.`,
      ].join("\n")
    : ``;

  const researchPrompt = [
    `You are a market researcher assessing product-market-fit evidence for a product hypothesis. Research the CURRENT state of the market using web search, then return your findings as a single structured research result.`,
    ``,
    `## Hypothesis under test (v${version.version})`,
    version.statement,
    ``,
    `## Signal metrics to assess (score each 0-100)`,
    EXTERNAL_ONLY_RULE,
    ...metrics.map(
      (m) =>
        `- **${m.name}** (weight ${m.weight}/5): ${m.description}${m.signals ? ` Evidence to look for: ${m.signals}.` : ""}${m.direction ? ` Scoring direction: ${m.direction}.` : ""}`
    ),
    ``,
    hypcheck.watchlist.length
      ? `## Watchlist — check each for recent moves relevant to the hypothesis\n${hypcheck.watchlist.map((w) => `- ${w}`).join("\n")}`
      : ``,
    priorSection,
    ``,
    `## Evidence freshness (hard rule)`,
    `Today is ${runDate.toISOString().slice(0, 10)}. The freshness window is the last ${windowDays} days${prior ? ` (everything since the previous run)` : ""}.`,
    `- Scope searches to recent material: prefer recency-qualified queries and results from inside the window.`,
    `- Only evidence published inside the window may move a metric score. Older material (up to ~90 days) is background context only — it must not change scores on its own.`,
    `- For every source, set \`publishedAt\` (YYYY-MM-DD) when the publication date is known; otherwise null. Never guess dates.`,
    `- For each metric, set \`freshness\`: "fresh" if the newest evidence supporting the score is inside the window, "stale" if you found only older evidence, "none" if you found no usable evidence. Do not stretch — "no fresh signal" is a valid, useful finding.`,
    ``,
    `## Instructions`,
    `- Research depth: ${DEPTH_LABELS[hypcheck.depth]}. Run at most ${DEPTH_SEARCHES[hypcheck.depth]} web searches total for this entire report — budget them across the whole task, front-loading the searches you need to assess the metrics and the watchlist.`,
    `- Ground every claim in what you find. When a field draws on a source, cite it inline as a markdown link, and list every source you cite in the \`sources\` array.`,
    `- \`execSummary\`: a 3-4 sentence executive summary of this period's findings, written for a product manager.${prior ? " Lead with what changed since the previous run." : ""}`,
    `- \`changesSinceLastRun\`: ${prior ? "2-4 sentences on what materially changed since the previous run — events, metric movements, and why." : "null (this is the first run)."}`,
    `- \`metricScores\`: assess each metric (use the exact metric names: ${metrics.map((m) => m.name).join(", ")}) with a 0-100 score, a 2-3 sentence evidence-based \`note\`, and its \`freshness\`. Then derive an overall \`pmfScore\` (0-100) as a weighted judgment, plus a \`confidence\` (0-1).`,
    `- \`insights\`: surface 1-3 insights. Mark each as supporting, challenging, or watch. If an insight genuinely warrants amending the hypothesis, include a complete \`proposedRevision\` of the hypothesis statement; otherwise set it to null.`,
    `- \`risks\` and \`actions\`: key risks and recommended actions for the product manager.`,
    hypcheck.watchlist.length
      ? `- \`watchlistNotes\`: one entry per watchlist name (exactly: ${hypcheck.watchlist.join(", ")}) noting any recent move relevant to the hypothesis.`
      : `- \`watchlistNotes\`: leave as an empty array (no watchlist configured).`,
    ``,
    `## The industryAnalysis object (write this as a world-class strategy analyst)`,
    `Fill in \`industryAnalysis\` as a sell-side/strategy analyst note for a leadership team. It must be tight — no more than two pages of prose across its fields.`,
    `IMPORTANT: do NOT run additional web searches specifically for this section. Synthesize it from the research and sources you already gathered for the signal analysis and watchlist above. This is analysis and judgment, not more searching.`,
    `- \`stance\`: the analyst's call — one of accelerate / advance / hold / reposition / retreat — and \`conviction\` (low/moderate/high). It must be consistent with the PMF evidence.`,
    `- \`headline\`: a BLUF (1-2 sentences): the single most important thing leadership should understand about the industry right now and what it implies for this hypothesis.`,
    `- \`landscape\`: market structure, where the category sits in its lifecycle (forming / early-growth / consolidating / mature), and momentum.`,
    `- \`competitiveDynamics\`: recent moves by the watchlist players and adjacent entrants — who is gaining, who is exposed, and where the whitespace and moat are.`,
    `- \`catalysts\`: 2-4 recent or forward-looking events that move (or could move) the market.`,
    `- \`implications\`: the "so what" — how this context strengthens or pressures the thesis, and the strategic option it points to.`,
    `Be opinionated and evidence-based, drawing on the sources already gathered.`,
  ]
    .filter(Boolean)
    .join("\n");

  const researchStart = Date.now();
  // Single pass: research with web search AND emit the structured run result
  // directly (json_schema output), then render the human-facing markdown
  // locally via buildReportMd. This removes the separate extraction call.
  const stream = anthropic.messages.stream(
    {
      model: MODEL,
      max_tokens: DEPTH_TOKENS[hypcheck.depth],
      thinking: { type: "adaptive" },
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: RESULT_SCHEMA as unknown as Record<string, unknown> },
      },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: DEPTH_SEARCHES[hypcheck.depth] }],
      messages: [{ role: "user", content: researchPrompt }],
    },
    { signal: AbortSignal.timeout(RESEARCH_ABORT_MS) }
  );
  const research = await stream.finalMessage();
  const researchMs = Date.now() - researchStart;
  const searches = webSearchRequests(research.usage);
  await onPhase?.("research_done", { researchMs, searches });
  log.info("engine.research.done", {
    ms: researchMs,
    model: MODEL,
    depth: hypcheck.depth,
    inputTokens: research.usage.input_tokens,
    outputTokens: research.usage.output_tokens,
    searches,
    stopReason: research.stop_reason,
  });

  const jsonText = research.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  if (!jsonText.trim()) {
    throw new Error(`Live research returned no structured result (stop_reason: ${research.stop_reason})`);
  }
  const data = JSON.parse(jsonText) as StructuredResult;

  const metricByName = new Map(metrics.map((m) => [m.name.toLowerCase(), m]));
  const priorScoreByName = new Map((prior?.metricScores ?? []).map((ms) => [ms.name.toLowerCase(), ms.score]));
  const metricScores = data.metricScores.map((ms) => {
    const metric = metricByName.get(ms.name.toLowerCase());
    const freshness = FRESHNESS_VALUES.includes(ms.freshness) ? ms.freshness : ("fresh" as EvidenceFreshness);
    const priorScore = priorScoreByName.get(ms.name.toLowerCase());
    // No fresh evidence -> the prior score stands; the market didn't move just
    // because old articles resurfaced in search results.
    const carriedForward = freshness !== "fresh" && priorScore != null;
    return {
      metricId: metric?.id ?? "",
      name: metric?.name ?? ms.name,
      score: carriedForward ? priorScore : Math.max(0, Math.min(100, ms.score)),
      note: ms.note,
      freshness,
      carriedForward,
    };
  });

  // Deterministic, freshness-gated PMF score: the weighted average of fresh and
  // carried-forward metric scores. Stale evidence cannot move the number even
  // if the model's own holistic judgment says otherwise (that judgment is kept
  // in telemetry logs as a sanity cross-check). On a first run, metrics with no
  // fresh signal have nothing to carry and are excluded from the weighting.
  let weightedSum = 0;
  let countedWeight = 0;
  let freshWeight = 0;
  let allWeight = 0;
  for (const ms of metricScores) {
    const weight = metricByName.get(ms.name.toLowerCase())?.weight ?? 3;
    allWeight += weight;
    if (ms.freshness === "fresh") freshWeight += weight;
    if (ms.freshness === "fresh" || ms.carriedForward) {
      weightedSum += ms.score * weight;
      countedWeight += weight;
    }
  }
  const modelPmfScore = Math.max(0, Math.min(100, data.pmfScore));
  const pmfScore = countedWeight > 0 ? weightedSum / countedWeight : modelPmfScore;
  const freshFraction = allWeight > 0 ? freshWeight / allWeight : 0;
  // Confidence drops mechanically as fresh coverage drops: all-fresh keeps the
  // model's confidence, an all-carried run halves it.
  const confidence = Math.max(0, Math.min(1, data.confidence)) * (0.5 + 0.5 * freshFraction);
  log.info("engine.score.computed", {
    pmfScore: Math.round(pmfScore * 10) / 10,
    modelPmfScore,
    freshFraction: Math.round(freshFraction * 100) / 100,
    carried: metricScores.filter((ms) => ms.carriedForward).length,
    windowDays,
  });

  const ia = data.industryAnalysis;
  const industryAnalysis = {
    headline: ia.headline,
    stance: STANCES.includes(ia.stance) ? ia.stance : "hold",
    conviction: CONVICTIONS.includes(ia.conviction) ? ia.conviction : "moderate",
    landscape: ia.landscape,
    competitiveDynamics: ia.competitiveDynamics,
    catalysts: Array.isArray(ia.catalysts) ? ia.catalysts.slice(0, 4) : [],
    implications: ia.implications,
  };

  const watchlistNotes: Record<string, string> = {};
  for (const w of data.watchlistNotes ?? []) watchlistNotes[w.name] = w.note;

  const changesSinceLastRun = prior ? data.changesSinceLastRun : null;
  // First freshness-gated run on top of pre-freshness history: flag the method
  // change in the report so the trend break is explainable.
  const methodChangeNote = prior != null && prior.metricScores.length > 0 && prior.metricScores.every((ms) => ms.freshness == null);

  // Render the markdown report locally from the structured result, reusing the
  // same builder the simulated engine uses.
  const reportBody = buildReportMd({
    name: hypcheck.name,
    statement: version.statement,
    version: version.version,
    runDate,
    mode: "live",
    depth: hypcheck.depth,
    pmfScore,
    confidence,
    execSummary: data.execSummary,
    industryAnalysis,
    metricScores,
    watchlist: hypcheck.watchlist,
    watchlistNotes,
    insights: data.insights,
    risks: data.risks,
    actions: data.actions,
    sources: Array.isArray(data.sources) ? data.sources : [],
    changesSinceLastRun,
    priorRunDate: prior?.runAt ?? null,
    windowDays,
    methodChangeNote,
  });

  return {
    result: {
      pmfScore,
      confidence,
      execSummary: data.execSummary,
      reportMd: `${reportBody}\n---\n\n*Report generated ${runDate.toISOString().slice(0, 10)} by live web research (${DEPTH_LABELS[hypcheck.depth]}).*\n`,
      metricScores,
      industryAnalysis,
      changesSinceLastRun,
      insights: data.insights,
    },
    telemetry: {
      inputTokens: research.usage.input_tokens,
      outputTokens: research.usage.output_tokens,
      searches,
    },
    runAt: runDate,
  };
}

const REFINE_SCHEMA = {
  type: "object",
  properties: {
    critique: {
      type: "string",
      description: "3-5 sentence critique: what is vague, unfalsifiable, or missing (target user, problem, differentiation, willingness to pay)",
    },
    refinedStatement: {
      type: "string",
      description: "A sharper, falsifiable rewrite of the hypothesis preserving the author's intent",
    },
    suggestedMetrics: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Short metric name, e.g. 'Demand signal'" },
          description: { type: "string", description: "What evidence this metric tracks and why it matters for PMF" },
          weight: { type: "integer", description: "Importance 1-5" },
          signals: {
            type: "string",
            description:
              "The concrete PUBLIC evidence a run should look for, e.g. 'funding announcements, launch posts, pricing-page changes, job postings for the workflow, search/community volume'",
          },
          direction: {
            type: "string",
            description:
              "What a score-up vs score-down observation looks like, so week-over-week scoring stays consistent, e.g. 'Up: new entrants raise; Down: incumbent bundles the feature for free'",
          },
        },
        required: ["name", "description", "weight", "signals", "direction"],
        additionalProperties: false,
      },
    },
    rejectedMetrics: {
      type: "array",
      description:
        "Candidate metrics you considered but rejected because they fail the external-observability or freshness test — never silently drop one",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          reason: { type: "string", description: "One line: why no run could observe this from public sources at cadence" },
        },
        required: ["name", "reason"],
        additionalProperties: false,
      },
    },
    suggestedWatchlist: {
      type: "array",
      items: { type: "string" },
      description: "4-6 real companies, products, or competitive signals to monitor",
    },
  },
  required: ["critique", "refinedStatement", "suggestedMetrics", "rejectedMetrics", "suggestedWatchlist"],
  additionalProperties: false,
} as const;

/** The external-only measurement constraint, stated identically in the refine
 * and run prompts. Hypchecks never see internal data — a metric that needs it
 * can never be scored. */
export const EXTERNAL_ONLY_RULE = [
  `Metrics must be assessable purely from public web sources: press releases, funding news, product launches, pricing pages, job postings, search/community trends, analyst coverage.`,
  `Never propose or lean on anything requiring internal data — revenue, pipeline, deals, customer calls, NPS, churn, active users — unless it's the kind of thing that would appear in a press release.`,
].join(" ");

export async function liveRefine(statement: string, log: Logger = rootLogger): Promise<RefineResult> {
  const anthropic = client();
  const start = Date.now();
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    output_config: { format: { type: "json_schema", schema: REFINE_SCHEMA as unknown as Record<string, unknown> } },
    messages: [
      {
        role: "user",
        content: [
          `You are a seasoned product strategy advisor. A product manager has drafted this product hypothesis:`,
          ``,
          `"${statement}"`,
          ``,
          `Critique it, rewrite it to be sharp and falsifiable, propose 4-5 weighted signal metrics for tracking product-market fit over time, and suggest a competitive watchlist.`,
          ``,
          `## Metric constraint (hard rule)`,
          EXTERNAL_ONLY_RULE,
          `For each suggested metric, also specify \`signals\` (the concrete public evidence a run should look for) and \`direction\` (what a score-up vs score-down observation looks like).`,
          `Validate every candidate metric before suggesting it: (1) is it observable from public sources only? (2) will fresh evidence realistically appear at a weekly-to-monthly tracking cadence? Candidates that fail either test go in \`rejectedMetrics\` with a one-line reason — never silently drop one.`,
        ].join("\n"),
      },
    ],
  });
  log.info("engine.refine.done", {
    ms: Date.now() - start,
    model: MODEL,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    stopReason: response.stop_reason,
  });
  const jsonText = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return JSON.parse(jsonText) as RefineResult;
}
