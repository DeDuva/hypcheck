export type Cadence = "daily" | "weekly" | "biweekly" | "monthly";
export type Depth = "brief" | "standard" | "deep";
export type RunMode = "simulated" | "live";
export type InsightDirection = "supporting" | "challenging" | "watch";
export type InsightStatus = "new" | "accepted" | "dismissed";
export type VersionSource = "initial" | "insight" | "manual" | "ai";

/** Global, account-level role — governs whether a user can create hypchecks
 * and, for admins, grants implicit access to every hypcheck. */
export type GlobalRole = "admin" | "creator" | "member";
/** Per-hypcheck grant role from the `hypcheck_access` table. */
export type GrantRole = "editor" | "viewer";

// Analyst's call — the leadership-facing stance the industry analysis lands on.
export type AnalystStance = "accelerate" | "advance" | "hold" | "reposition" | "retreat";
export type Conviction = "low" | "moderate" | "high";

export const STANCE_LABELS: Record<AnalystStance, string> = {
  accelerate: "Accelerate",
  advance: "Advance",
  hold: "Hold",
  reposition: "Reposition",
  retreat: "Retreat",
};

export const STANCE_BLURB: Record<AnalystStance, string> = {
  accelerate: "Strong tailwind and an open window — move faster than planned.",
  advance: "Conditions favor the thesis — proceed and press the advantage.",
  hold: "Mixed signal — maintain course and let the next cycles adjudicate.",
  reposition: "Headwinds or a closing window — adjust the wedge before pressing on.",
  retreat: "Structurally unfavorable — deprioritize or pivot away.",
};

/** An analyst-grade industry briefing attached to each run (max ~2 pages). */
export interface IndustryAnalysis {
  headline: string; // BLUF: the single most important industry takeaway, 1-2 sentences
  stance: AnalystStance;
  conviction: Conviction;
  landscape: string; // market structure, lifecycle stage, momentum
  competitiveDynamics: string; // moves by watchlist + adjacent entrants; whitespace
  catalysts: string[]; // recent/upcoming events that move the market
  implications: string; // the "so what" for this hypothesis
}

/** The role a watchlist entry plays in the hypothesis, so suggestions can be
 * grouped instead of shown as an undifferentiated list. Absent on manually
 * typed entries and on watchlists created before this field existed. */
export type WatchlistCategory = "competitor" | "platform_threat" | "signal";

export const WATCHLIST_CATEGORY_LABELS: Record<WatchlistCategory, string> = {
  competitor: "Direct competitor",
  platform_threat: "Platform risk",
  signal: "Leading indicator",
};

/** A watchlist entry: a real company/product/signal plus WHY it's watched —
 * the reason is what makes run-time checks targeted rather than generic. */
export interface WatchlistEntry {
  name: string;
  reason: string; // e.g. "closest incumbent for the same JTBD"; empty on pre-feature entries
  category?: WatchlistCategory;
}

/** A run-proposed watchlist edit, accepted/dismissed like a hypothesis revision. */
export interface WatchlistChange {
  action: "add" | "remove";
  name: string;
  reason: string;
}

/** One check of the hypothesis-quality rubric the AI refinement applies. */
export interface RubricCheck {
  criterion: string;
  pass: boolean;
  fix: string | null; // one-line fix when the check fails
}

/** The refinement critique + rubric persisted with a hypcheck — the standing
 * definition of what "testing this hypothesis" means. */
export interface RefinementNotes {
  critique: string;
  rubric: RubricCheck[];
}

export interface Hypcheck {
  id: string;
  name: string;
  status: "active" | "paused";
  cadence: Cadence;
  depth: Depth;
  model: ModelFamily; // resolved to the newest model in the family at run time
  watchlist: WatchlistEntry[]; // companies, products, competitive signals — with reasons
  createdAt: string; // ISO
  nextRunAt: string | null; // ISO
  ownerId: string | null; // null on hypchecks created before phase 2 (grandfathered, shared access)
  refinement: RefinementNotes | null; // null when created without AI refinement (or pre-feature)
}

/**
 * Model selection is by FAMILY, not pinned model ID — the engine resolves a
 * family to the newest model in it at run time (see lib/models.ts), so new
 * releases are picked up without a config change.
 */
export type ModelFamily = "haiku" | "sonnet" | "opus" | "fable";

export const MODEL_FAMILIES: ModelFamily[] = ["haiku", "sonnet", "opus", "fable"];

/** Families every creator can use without an admin grant. */
export const BASE_MODEL_FAMILIES: ModelFamily[] = ["haiku", "sonnet"];

/** Families an admin can additionally enable per user. */
export const GRANTABLE_MODEL_FAMILIES: ModelFamily[] = ["opus", "fable"];

export const MODEL_FAMILY_LABELS: Record<ModelFamily, string> = {
  haiku: "Haiku — fastest, most cost-effective",
  sonnet: "Sonnet — balanced (default)",
  opus: "Opus — most capable Opus-tier",
  fable: "Fable — most capable, premium",
};

export const DEFAULT_MODEL_FAMILY: ModelFamily = "sonnet";

export interface HypcheckAccessGrant {
  id: string;
  hypcheckId: string;
  userId: string;
  role: GrantRole;
  grantedBy: string;
  createdAt: string;
}

/** An email invited to a hypcheck before they've ever signed in — activated
 * into a real HypcheckAccessGrant on that email's first login. */
export interface HypcheckInvitation {
  id: string;
  hypcheckId: string;
  email: string;
  role: GrantRole;
  invitedBy: string;
  createdAt: string;
}

/** An email allowed to sign in at all, with the GlobalRole it starts at —
 * the DB-backed, admin-editable form of the ALLOWED_EMAILS env var. Checked
 * on every request (see auth.ts isEmailAllowed), so removing a row revokes
 * access immediately, same as removing an env var entry always has. */
export interface AllowedEmail {
  id: string;
  email: string;
  role: GlobalRole;
  addedBy: string;
  createdAt: string;
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
  /** The concrete public evidence a run should look for (press releases, funding
   * news, launches, pricing pages, job postings, search/community trends…).
   * Empty on metrics created before the external-only model. */
  signals: string;
  /** What a score-up vs. score-down observation looks like, so week-over-week
   * scoring stays consistent. Empty on pre-feature metrics. */
  direction: string;
}

/** Age of the newest evidence supporting a metric score, relative to the
 * run's freshness window (the period since the previous run). */
export type EvidenceFreshness = "fresh" | "stale" | "none";

export interface MetricScore {
  metricId: string;
  name: string;
  score: number; // 0-100
  note: string;
  freshness?: EvidenceFreshness; // absent on runs recorded before freshness discipline
  carriedForward?: boolean; // true when the score is the prior run's, kept because no fresh evidence emerged
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
  industryAnalysis: IndustryAnalysis | null; // null on runs recorded before this feature
  changesSinceLastRun: string | null; // delta summary vs the previous run; null on first runs and pre-feature runs
  telemetry: RunTelemetry;
}

export type TraceKind = "research" | "refine";
export type TraceStatus = "running" | "ok" | "error";
export type TraceSpanKind = "thinking" | "web_search_query" | "web_search_result" | "text_output" | "other";

export interface TraceSpan {
  id: string;
  traceId: string;
  seq: number;
  kind: TraceSpanKind;
  label: string;
  startMs: number; // offset from trace start
  durationMs: number;
  inputText: string | null;
  outputText: string | null;
}

/** A single timed phase within a trace, before it has a DB-assigned id/seq. */
export interface SpanInput {
  kind: TraceSpanKind;
  label: string;
  startMs: number;
  durationMs: number;
  inputText: string | null;
  outputText: string | null;
}

export interface Trace {
  id: string;
  hypcheckId: string | null; // null for refine calls in the pre-creation wizard
  runId: string | null; // null until the run row is recorded and linked
  kind: TraceKind;
  status: TraceStatus;
  model: string;
  startedAt: string; // ISO
  durationMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  searches: number | null;
  stopReason: string | null;
  error: string | null;
  requestText: string;
}

export interface Insight {
  id: string;
  runId: string;
  hypcheckId: string;
  title: string;
  body: string;
  direction: InsightDirection;
  proposedRevision: string | null; // full replacement hypothesis statement
  proposedWatchlistChange: WatchlistChange | null; // run-proposed watchlist add/remove
  status: InsightStatus;
  createdAt: string;
}

export interface RunResult {
  pmfScore: number;
  confidence: number;
  execSummary: string;
  reportMd: string;
  metricScores: MetricScore[];
  industryAnalysis: IndustryAnalysis;
  changesSinceLastRun: string | null;
  insights: Array<{
    title: string;
    body: string;
    direction: InsightDirection;
    proposedRevision: string | null;
    proposedWatchlistChange?: WatchlistChange | null;
  }>;
}

/** Digest of the previous run, passed into the engine so each run scores
 * consistently against it and reports what changed. */
export interface PriorRunDigest {
  runAt: string; // ISO
  hypothesisVersion: number;
  pmfScore: number;
  stance: AnalystStance | null;
  metricScores: MetricScore[];
  openInsightTitles: string[];
}

export interface RefineResult {
  critique: string;
  refinedStatement: string;
  /** Five pass/fail checks: named segment · falsifiable claim · externally
   * observable evidence · time-bound/testable · differentiated vs incumbents. */
  rubric: RubricCheck[];
  /** 0-2 questions, asked only when research can't resolve an ambiguity in the
   * author's directional intent. Answering them powers one refine-again round. */
  clarifyingQuestions: string[];
  suggestedMetrics: Array<{ name: string; description: string; weight: number; signals: string; direction: string }>;
  /** Candidate metrics the validator rejected (need internal data, or fresh
   * public evidence won't realistically appear at tracking cadence). Surfaced
   * to the user as a quiet explanation, never silently dropped. */
  rejectedMetrics: Array<{ name: string; reason: string }>;
  suggestedWatchlist: WatchlistEntry[];
}

/** A user's answer to one clarifying question, fed into the second refine round. */
export interface RefineAnswer {
  question: string;
  answer: string;
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

export const GLOBAL_ROLE_LABELS: Record<GlobalRole, string> = {
  admin: "Admin",
  creator: "Creator",
  member: "Member",
};
