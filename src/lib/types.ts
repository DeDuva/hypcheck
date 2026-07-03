export type Cadence = "daily" | "weekly" | "biweekly" | "monthly";
export type Depth = "brief" | "standard" | "deep";
export type RunMode = "simulated" | "live";
export type InsightDirection = "supporting" | "challenging" | "watch";
export type InsightStatus = "new" | "accepted" | "dismissed";
export type VersionSource = "initial" | "insight" | "manual" | "ai";

export interface Hypcheck {
  id: string;
  name: string;
  status: "active" | "paused";
  cadence: Cadence;
  depth: Depth;
  watchlist: string[]; // companies, products, competitive signals
  createdAt: string; // ISO
  nextRunAt: string | null; // ISO
}

export interface HypothesisVersion {
  id: string;
  hypcheckId: string;
  version: number;
  statement: string;
  changeSummary: string | null; // what changed vs previous and why
  source: VersionSource;
  createdAt: string;
}

export interface Metric {
  id: string;
  hypcheckId: string;
  name: string;
  description: string;
  weight: number; // 1-5
}

export interface MetricScore {
  metricId: string;
  name: string;
  score: number; // 0-100
  note: string;
}

export interface RunTelemetry {
  durationMs: number | null; // wall-clock of the engine compute
  inputTokens: number | null; // live runs only
  outputTokens: number | null; // live runs only
  searches: number | null; // web_search requests, live runs only
}

export interface Run {
  id: string;
  hypcheckId: string;
  hypothesisVersionId: string;
  hypothesisVersion: number;
  runAt: string; // ISO
  mode: RunMode;
  pmfScore: number; // 0-100
  confidence: number; // 0-1
  execSummary: string;
  reportMd: string;
  metricScores: MetricScore[];
  telemetry: RunTelemetry;
}

export interface Insight {
  id: string;
  runId: string;
  hypcheckId: string;
  title: string;
  body: string;
  direction: InsightDirection;
  proposedRevision: string | null; // full replacement hypothesis statement
  status: InsightStatus;
  createdAt: string;
}

export interface RunResult {
  pmfScore: number;
  confidence: number;
  execSummary: string;
  reportMd: string;
  metricScores: MetricScore[];
  insights: Array<{
    title: string;
    body: string;
    direction: InsightDirection;
    proposedRevision: string | null;
  }>;
}

export interface RefineResult {
  critique: string;
  refinedStatement: string;
  suggestedMetrics: Array<{ name: string; description: string; weight: number }>;
  suggestedWatchlist: string[];
}

export const SCORE_BANDS = [
  { min: 70, key: "strong", label: "Strong signal" },
  { min: 55, key: "promising", label: "Promising" },
  { min: 40, key: "emerging", label: "Emerging" },
  { min: 0, key: "weak", label: "Weak signal" },
] as const;

export type BandKey = (typeof SCORE_BANDS)[number]["key"];

export function scoreBand(score: number) {
  return SCORE_BANDS.find((b) => score >= b.min) ?? SCORE_BANDS[SCORE_BANDS.length - 1];
}

export const CADENCE_LABELS: Record<Cadence, string> = {
  daily: "Daily",
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
};

export const CADENCE_DAYS: Record<Cadence, number> = {
  daily: 1,
  weekly: 7,
  biweekly: 14,
  monthly: 30,
};

export const DEPTH_LABELS: Record<Depth, string> = {
  brief: "Brief scan",
  standard: "Standard",
  deep: "Deep dive",
};
