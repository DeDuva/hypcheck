import Anthropic from "@anthropic-ai/sdk";
import type { Depth, Hypcheck, HypothesisVersion, Metric, RefineResult, RunResult, RunTelemetry } from "../types";
import { DEPTH_LABELS } from "../types";
import { Logger, logger as rootLogger } from "../logger";

const MODEL = process.env.HYPCHECK_MODEL || "claude-opus-4-8";
// The extraction pass only reformats the report into JSON — a fast model does
// it well and shaves seconds off the run, which matters under a tight
// (e.g. Vercel Hobby 60s) function budget.
const EXTRACT_MODEL = process.env.HYPCHECK_EXTRACT_MODEL || "claude-haiku-4-5";

const DEPTH_SEARCHES: Record<Depth, number> = { brief: 3, standard: 5, deep: 8 };
const DEPTH_TOKENS: Record<Depth, number> = { brief: 6000, standard: 12000, deep: 24000 };

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
  required: ["pmfScore", "confidence", "execSummary", "metricScores", "insights", "risks", "actions", "watchlistNotes"],
  additionalProperties: false,
} as const;

interface StructuredResult {
  pmfScore: number;
  confidence: number;
  execSummary: string;
  metricScores: Array<{ name: string; score: number; note: string }>;
  insights: Array<{ title: string; body: string; direction: "supporting" | "challenging" | "watch"; proposedRevision: string | null }>;
  risks: string[];
  actions: string[];
  watchlistNotes: Array<{ name: string; note: string }>;
}

export async function liveRun(
  hypcheck: Hypcheck,
  version: HypothesisVersion,
  metrics: Metric[],
  priorContext: string | null,
  log: Logger = rootLogger
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
    `- Research depth: ${DEPTH_LABELS[hypcheck.depth]}.`,
    `- Ground every claim in what you find; cite the source inline as a markdown link.`,
    `- Assess each metric, then derive an overall PMF score (0-100) as a weighted judgment.`,
    `- Surface 1-3 insights. Mark each as supporting, challenging, or watch. If an insight genuinely warrants amending the hypothesis, include a complete proposed revision of the hypothesis statement.`,
    `- End with key risks and recommended actions for the product manager.`,
    ``,
    `Write the full report in markdown with these sections: Executive summary, Signal analysis (one subsection per metric with a 0-100 score), Competitive & market watch, Insights, Key risks, Recommended actions, Sources.`,
  ]
    .filter(Boolean)
    .join("\n");

  const researchStart = Date.now();
  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: DEPTH_TOKENS[hypcheck.depth],
    thinking: { type: "adaptive" },
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: DEPTH_SEARCHES[hypcheck.depth] }],
    messages: [{ role: "user", content: researchPrompt }],
  });
  const research = await stream.finalMessage();
  const searches = webSearchRequests(research.usage);
  log.info("engine.research.done", {
    ms: Date.now() - researchStart,
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

  return {
    result: {
      pmfScore: Math.max(0, Math.min(100, data.pmfScore)),
      confidence: Math.max(0, Math.min(1, data.confidence)),
      execSummary: data.execSummary,
      reportMd: `${reportMd}\n\n---\n\n*Report generated ${runDate.toISOString().slice(0, 10)} by live web research (${DEPTH_LABELS[hypcheck.depth]}).*\n`,
      metricScores,
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
