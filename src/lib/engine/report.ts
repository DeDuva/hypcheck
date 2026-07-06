import type { Depth, IndustryAnalysis, InsightDirection, MetricScore } from "../types";
import { DEPTH_LABELS, STANCE_BLURB, STANCE_LABELS, scoreBand } from "../types";

export interface ReportInput {
  name: string;
  statement: string;
  version: number;
  runDate: Date;
  mode: "simulated" | "live";
  depth: Depth;
  pmfScore: number;
  confidence: number;
  execSummary: string;
  industryAnalysis?: IndustryAnalysis | null;
  metricScores: MetricScore[];
  watchlist: string[];
  watchlistNotes: Record<string, string>;
  insights: Array<{ title: string; body: string; direction: InsightDirection; proposedRevision: string | null }>;
  risks: string[];
  actions: string[];
  sources?: Array<{ title: string; url: string; publishedAt?: string | null }>;
  changesSinceLastRun?: string | null;
  priorRunDate?: string | null; // ISO date of the previous run, for the "what changed" heading
  windowDays?: number; // freshness window used by this run
  methodChangeNote?: boolean; // true on the first freshness-gated run after older-method runs
}

const DIRECTION_LABEL: Record<InsightDirection, string> = {
  supporting: "Supporting",
  challenging: "Challenging",
  watch: "Watch",
};

/** Renders the analyst-style industry analysis as markdown lines. */
export function renderIndustryAnalysis(ia: IndustryAnalysis): string[] {
  const lines: string[] = [];
  lines.push(`## Industry Analysis`);
  lines.push("");
  lines.push(`**Analyst's call: ${STANCE_LABELS[ia.stance]}** · ${ia.conviction} conviction`);
  lines.push("");
  lines.push(`*${STANCE_BLURB[ia.stance]}*`);
  lines.push("");
  lines.push(ia.headline);
  lines.push("");
  lines.push(`### Landscape`);
  lines.push("");
  lines.push(ia.landscape);
  lines.push("");
  lines.push(`### Competitive dynamics`);
  lines.push("");
  lines.push(ia.competitiveDynamics);
  lines.push("");
  if (ia.catalysts.length) {
    lines.push(`### Catalysts & signals to watch`);
    lines.push("");
    for (const c of ia.catalysts) lines.push(`- ${c}`);
    lines.push("");
  }
  lines.push(`### Implications for the hypothesis`);
  lines.push("");
  lines.push(ia.implications);
  lines.push("");
  return lines;
}

export function buildReportMd(r: ReportInput): string {
  const band = scoreBand(r.pmfScore);
  const date = r.runDate.toISOString().slice(0, 10);
  const lines: string[] = [];

  lines.push(`# PMF Research Report — ${r.name}`);
  lines.push("");
  lines.push(`**Date:** ${date} · **Hypothesis:** v${r.version} · **Depth:** ${DEPTH_LABELS[r.depth]} · **Mode:** ${r.mode === "live" ? "Live research" : "Simulated"}`);
  lines.push("");
  lines.push(`## PMF score: ${Math.round(r.pmfScore)} / 100 — ${band.label}`);
  lines.push("");
  lines.push(`Confidence in this assessment: ${Math.round(r.confidence * 100)}%.`);
  lines.push("");
  lines.push(`### Hypothesis under test`);
  lines.push("");
  lines.push(`> ${r.statement}`);
  lines.push("");
  lines.push(`## Executive summary`);
  lines.push("");
  lines.push(r.execSummary);
  lines.push("");
  if (r.changesSinceLastRun) {
    lines.push(`## What changed${r.priorRunDate ? ` since ${r.priorRunDate.slice(0, 10)}` : ""}`);
    lines.push("");
    lines.push(r.changesSinceLastRun);
    lines.push("");
  }
  if (r.industryAnalysis) {
    lines.push(...renderIndustryAnalysis(r.industryAnalysis));
  }
  lines.push(`## Signal analysis`);
  lines.push("");
  for (const m of r.metricScores) {
    const flag = m.carriedForward
      ? " · carried forward (no fresh signal)"
      : m.freshness && m.freshness !== "fresh"
        ? " · no fresh signal"
        : "";
    lines.push(`### ${m.name} — ${Math.round(m.score)}/100${flag}`);
    lines.push("");
    lines.push(m.note);
    lines.push("");
  }
  if (r.watchlist.length) {
    lines.push(`## Competitive & market watch`);
    lines.push("");
    for (const w of r.watchlist) {
      lines.push(`- **${w}** — ${r.watchlistNotes[w] ?? "No notable movement observed this period."}`);
    }
    lines.push("");
  }
  if (r.insights.length) {
    lines.push(`## Insights`);
    lines.push("");
    for (const ins of r.insights) {
      lines.push(`### [${DIRECTION_LABEL[ins.direction]}] ${ins.title}`);
      lines.push("");
      lines.push(ins.body);
      if (ins.proposedRevision) {
        lines.push("");
        lines.push(`**Proposed hypothesis revision:** ${ins.proposedRevision}`);
      }
      lines.push("");
    }
  }
  if (r.risks.length) {
    lines.push(`## Key risks`);
    lines.push("");
    for (const risk of r.risks) lines.push(`- ${risk}`);
    lines.push("");
  }
  if (r.actions.length) {
    lines.push(`## Recommended actions`);
    lines.push("");
    for (const a of r.actions) lines.push(`- ${a}`);
    lines.push("");
  }
  if (r.sources && r.sources.length) {
    lines.push(`## Sources`);
    lines.push("");
    const windowMs = (r.windowDays ?? 0) * 24 * 60 * 60 * 1000;
    const cutoff = r.windowDays ? r.runDate.getTime() - windowMs : null;
    const dated = r.sources.filter((s) => s.publishedAt);
    const inWindow = cutoff == null ? [] : dated.filter((s) => new Date(s.publishedAt!).getTime() >= cutoff);
    const background = cutoff == null ? [] : dated.filter((s) => new Date(s.publishedAt!).getTime() < cutoff);
    const undatedOrCurrent = r.sources.filter((s) => !background.includes(s));
    if (cutoff != null) {
      lines.push(`*Evidence freshness: ${inWindow.length} of ${r.sources.length} sources dated within the last ${r.windowDays} days.*`);
      lines.push("");
    }
    const sourceLine = (s: { title: string; url: string; publishedAt?: string | null }) =>
      `- [${s.title}](${s.url})${s.publishedAt ? ` — ${s.publishedAt.slice(0, 10)}` : ""}`;
    for (const s of undatedOrCurrent) lines.push(sourceLine(s));
    lines.push("");
    if (background.length) {
      lines.push(`### Background (older than the freshness window)`);
      lines.push("");
      for (const s of background) lines.push(sourceLine(s));
      lines.push("");
    }
  }
  lines.push(`## Methodology`);
  lines.push("");
  if (r.mode === "live") {
    lines.push(
      `This report was produced by live web research against the hypothesis. Only evidence published within the freshness window${r.windowDays ? ` (the last ${r.windowDays} days)` : ""} moves a metric's score; a metric with no fresh signal carries its prior score forward, flagged as such. The PMF score is the weighted average of the metric scores. Sources were gathered at ${DEPTH_LABELS[r.depth].toLowerCase()} depth. Scores are directional estimates intended for longitudinal comparison, not absolute market sizing.`
    );
    if (r.methodChangeNote) {
      lines.push("");
      lines.push(
        `**Method note:** starting with this run, the PMF score is computed as a freshness-gated weighted average of the metric scores; earlier runs used the model's holistic judgment. A small level shift against prior runs is expected and does not by itself indicate a market change.`
      );
    }
  } else {
    lines.push(
      `**Simulated run.** This report was generated by the demo engine without live web research (no \`ANTHROPIC_API_KEY\` configured). Scores and findings are illustrative and intended to demonstrate the product experience. Configure an API key to enable live research runs.`
    );
  }
  lines.push("");
  return lines.join("\n");
}
