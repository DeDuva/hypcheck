import Anthropic from "@anthropic-ai/sdk";
import type { Depth, Hypcheck, HypothesisVersion, Metric, RefineResult, RunResult, RunTelemetry } from "../types";
import { DEPTH_LABELS } from "../types";
import { Logger, logger as rootLogger } from "../logger";

// Sonnet is the default research model: ~2-3x faster than Opus at web-grounded
// synthesis, which keeps a run (incl. the industry-analysis section) well under
// Vercel's 300s function ceiling. Override with HYPCHECK_MODEL for max depth.
const MODEL = process.env.HYPCHECK_MODEL || "claude-sonnet-4-6";
// The extraction pass only reformats the report into JSON — a fast model does
// it well and shaves seconds off the run, which matters under a tight
// (e.g. Vercel Hobby 60s) function budget.
const EXTRACT_MODEL = process.env.HYPCHECK_EXTRACT_MODEL || "claude-haiku-4-5";

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
export function engineInfo(): { model: string; extractModel: string; hasKey: boolean } {
  return { model: MODEL, extractModel: EXTRACT_MODEL, hasKey: liveEngineAvailable() };
}

export type LiveTelemetry = Pick<RunTelemetry, "inputTokens" | "outputTokens" | "searches">;
export interface LiveRunOutput {
  result: RunResult;
  telemetry: LiveTelemetry;
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
        },
        required: ["name", "score", "note"],
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
  },
  required: ["pmfScore", "confidence", "execSummary", "metricScores", "industryAnalysis", "insights", "risks", "actions", "watchlistNotes"],
  additionalProperties: false,
} as const;

const STANCES = ["accelerate", "advance", "hold", "reposition", "retreat"] as const;
const CONVICTIONS = ["low", "moderate", "high"] as const;

interface StructuredResult {
  pmfScore: number;
  confidence: number;
  execSummary: string;
  metricScores: Array<{ name: string; score: number; note: string }>;
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
}

export type PhaseReporter = (phase: string, extra?: Record<string, unknown>) => void | Promise<void>;

export async function liveRun(
  hypcheck: Hypcheck,
  version: HypothesisVersion,
  metrics: Metric[],
  priorContext: string | null,
  log: Logger = rootLogger,
  onPhase?: PhaseReporter
): Promise<LiveRunOutput> {
  const anthropic = client();
  const runDate = new Date();

  const researchPrompt = [
    `You are a market researcher assessing product-market-fit evidence for a product hypothesis. Research the CURRENT state of the market using web search, then write a research report.`,
    ``,
    `## Hypothesis under test (v${version.version})`,
    version.statement,
    ``,
    `## Signal metrics to assess (score each 0-100)`,
    ...metrics.map((m) => `- **${m.name}** (weight ${m.weight}/5): ${m.description}`),
    ``,
    hypcheck.watchlist.length
      ? `## Watchlist — check each for recent moves relevant to the hypothesis\n${hypcheck.watchlist.map((w) => `- ${w}`).join("\n")}`
      : ``,
    priorContext ? `## Context from the previous run\n${priorContext}` : ``,
    ``,
    `## Instructions`,
    `- Research depth: ${DEPTH_LABELS[hypcheck.depth]}. Run at most ${DEPTH_SEARCHES[hypcheck.depth]} web searches total for this entire report — budget them across the whole task, front-loading the searches you need to assess the metrics and the watchlist.`,
    `- Ground every claim in what you find; cite the source inline as a markdown link.`,
    `- Assess each metric, then derive an overall PMF score (0-100) as a weighted judgment.`,
    `- Surface 1-3 insights. Mark each as supporting, challenging, or watch. If an insight genuinely warrants amending the hypothesis, include a complete proposed revision of the hypothesis statement.`,
    `- End with key risks and recommended actions for the product manager.`,
    ``,
    `## The Industry Analysis section (write this as a world-class strategy analyst)`,
    `Immediately after the Executive summary, write a section titled "## Industry Analysis" that reads like a sell-side/strategy analyst note for a leadership team. It must be tight — no more than two pages.`,
    `IMPORTANT: do NOT run additional web searches specifically for this section. Synthesize it from the research and sources you already gathered for the signal analysis and watchlist above. This is analysis and judgment, not more searching.`,
    `Structure it exactly as:`,
    `- Open with an **Analyst's call**: one of Accelerate / Advance / Hold / Reposition / Retreat, plus a conviction level (low/moderate/high), then a one-line rationale.`,
    `- A BLUF headline (1-2 sentences): the single most important thing leadership should understand about the industry right now and what it implies for this hypothesis.`,
    `- **Landscape**: market structure, where the category sits in its lifecycle (forming / early-growth / consolidating / mature), and momentum.`,
    `- **Competitive dynamics**: recent moves by the watchlist players and adjacent entrants — who is gaining, who is exposed, and where the whitespace and moat are.`,
    `- **Catalysts & signals to watch**: 2-4 recent or forward-looking events that move (or could move) the market.`,
    `- **Implications for the hypothesis**: the "so what" — how this context strengthens or pressures the thesis, and the strategic option it points to.`,
    `Be opinionated and evidence-based, drawing on the sources already gathered. The Analyst's call must be consistent with the PMF evidence.`,
    ``,
    `Write the full report in markdown with these sections in order: Executive summary, Industry Analysis, Signal analysis (one subsection per metric with a 0-100 score), Insights, Key risks, Recommended actions, Sources.`,
  ]
    .filter(Boolean)
    .join("\n");

  const researchStart = Date.now();
  const stream = anthropic.messages.stream(
    {
      model: MODEL,
      max_tokens: DEPTH_TOKENS[hypcheck.depth],
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
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
  const reportMd = research.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  if (!reportMd.trim()) {
    throw new Error(`Live research returned no report text (stop_reason: ${research.stop_reason})`);
  }

  // Second pass: distill the research report into the structured run result.
  const extractStart = Date.now();
  const structured = await anthropic.messages.create({
    model: EXTRACT_MODEL,
    max_tokens: 8000,
    output_config: { format: { type: "json_schema", schema: RESULT_SCHEMA as unknown as Record<string, unknown> } },
    messages: [
      {
        role: "user",
        content: [
          `Extract the structured run result from this PMF research report. Metric names must match exactly: ${metrics.map((m) => m.name).join(", ")}.`,
          hypcheck.watchlist.length ? `Watchlist names must match exactly: ${hypcheck.watchlist.join(", ")}.` : ``,
          ``,
          reportMd,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  });
  log.info("engine.extract.done", {
    ms: Date.now() - extractStart,
    model: EXTRACT_MODEL,
    inputTokens: structured.usage.input_tokens,
    outputTokens: structured.usage.output_tokens,
    stopReason: structured.stop_reason,
  });

  const jsonText = structured.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const data = JSON.parse(jsonText) as StructuredResult;

  const metricByName = new Map(metrics.map((m) => [m.name.toLowerCase(), m]));
  const metricScores = data.metricScores.map((ms) => {
    const metric = metricByName.get(ms.name.toLowerCase());
    return {
      metricId: metric?.id ?? "",
      name: metric?.name ?? ms.name,
      score: Math.max(0, Math.min(100, ms.score)),
      note: ms.note,
    };
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

  return {
    result: {
      pmfScore: Math.max(0, Math.min(100, data.pmfScore)),
      confidence: Math.max(0, Math.min(1, data.confidence)),
      execSummary: data.execSummary,
      reportMd: `${reportMd}\n\n---\n\n*Report generated ${runDate.toISOString().slice(0, 10)} by live web research (${DEPTH_LABELS[hypcheck.depth]}).*\n`,
      metricScores,
      industryAnalysis,
      insights: data.insights,
    },
    telemetry: {
      inputTokens: research.usage.input_tokens + structured.usage.input_tokens,
      outputTokens: research.usage.output_tokens + structured.usage.output_tokens,
      searches,
    },
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
        },
        required: ["name", "description", "weight"],
        additionalProperties: false,
      },
    },
    suggestedWatchlist: {
      type: "array",
      items: { type: "string" },
      description: "4-6 real companies, products, or competitive signals to monitor",
    },
  },
  required: ["critique", "refinedStatement", "suggestedMetrics", "suggestedWatchlist"],
  additionalProperties: false,
} as const;

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
        content: `You are a seasoned product strategy advisor. A product manager has drafted this product hypothesis:\n\n"${statement}"\n\nCritique it, rewrite it to be sharp and falsifiable, propose 4-5 weighted signal metrics for tracking product-market fit over time, and suggest a competitive watchlist.`,
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
