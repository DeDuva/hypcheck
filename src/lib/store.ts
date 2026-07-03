import { getDb, newId } from "./db";
import type {
  Cadence,
  Depth,
  Hypcheck,
  HypothesisVersion,
  Insight,
  InsightDirection,
  Metric,
  MetricScore,
  Run,
  RunResult,
  RunTelemetry,
  VersionSource,
} from "./types";
import { CADENCE_DAYS } from "./types";

type Row = Record<string, unknown>;

function rowToHypcheck(r: Row): Hypcheck {
  return {
    id: r.id as string,
    name: r.name as string,
    status: r.status as Hypcheck["status"],
    cadence: r.cadence as Cadence,
    depth: r.depth as Depth,
    watchlist: JSON.parse((r.watchlist as string) || "[]"),
    createdAt: r.created_at as string,
    nextRunAt: (r.next_run_at as string) ?? null,
  };
}

function rowToVersion(r: Row): HypothesisVersion {
  return {
    id: r.id as string,
    hypcheckId: r.hypcheck_id as string,
    version: Number(r.version),
    statement: r.statement as string,
    changeSummary: (r.change_summary as string) ?? null,
    source: r.source as VersionSource,
    createdAt: r.created_at as string,
  };
}

function rowToMetric(r: Row): Metric {
  return {
    id: r.id as string,
    hypcheckId: r.hypcheck_id as string,
    name: r.name as string,
    description: (r.description as string) ?? "",
    weight: Number(r.weight),
  };
}

function rowToRun(r: Row): Run {
  return {
    id: r.id as string,
    hypcheckId: r.hypcheck_id as string,
    hypothesisVersionId: r.hypothesis_version_id as string,
    hypothesisVersion: Number(r.hypothesis_version),
    runAt: r.run_at as string,
    mode: r.mode as Run["mode"],
    pmfScore: Number(r.pmf_score),
    confidence: Number(r.confidence),
    execSummary: r.exec_summary as string,
    reportMd: r.report_md as string,
    metricScores: JSON.parse((r.metric_scores as string) || "[]") as MetricScore[],
    telemetry: {
      durationMs: r.duration_ms == null ? null : Number(r.duration_ms),
      inputTokens: r.input_tokens == null ? null : Number(r.input_tokens),
      outputTokens: r.output_tokens == null ? null : Number(r.output_tokens),
      searches: r.searches == null ? null : Number(r.searches),
    },
  };
}

function rowToInsight(r: Row): Insight {
  return {
    id: r.id as string,
    runId: r.run_id as string,
    hypcheckId: r.hypcheck_id as string,
    title: r.title as string,
    body: r.body as string,
    direction: r.direction as InsightDirection,
    proposedRevision: (r.proposed_revision as string) ?? null,
    status: r.status as Insight["status"],
    createdAt: r.created_at as string,
  };
}

// ---------------------------------------------------------------------------
// Hypchecks
// ---------------------------------------------------------------------------

export async function listHypchecks(): Promise<Hypcheck[]> {
  const db = await getDb();
  const res = await db.execute("SELECT * FROM hypchecks ORDER BY created_at DESC");
  return res.rows.map((r) => rowToHypcheck(r as Row));
}

export async function getHypcheck(id: string): Promise<Hypcheck | null> {
  const db = await getDb();
  const res = await db.execute({ sql: "SELECT * FROM hypchecks WHERE id = ?", args: [id] });
  return res.rows[0] ? rowToHypcheck(res.rows[0] as Row) : null;
}

export interface CreateHypcheckInput {
  name: string;
  statement: string;
  cadence: Cadence;
  depth: Depth;
  watchlist: string[];
  metrics: Array<{ name: string; description: string; weight: number }>;
}

export async function createHypcheck(input: CreateHypcheckInput): Promise<Hypcheck> {
  const db = await getDb();
  const id = newId();
  const now = new Date().toISOString();
  await db.execute({
    sql: `INSERT INTO hypchecks (id, name, status, cadence, depth, watchlist, created_at, next_run_at)
          VALUES (?, ?, 'active', ?, ?, ?, ?, ?)`,
    args: [id, input.name, input.cadence, input.depth, JSON.stringify(input.watchlist), now, now],
  });
  await db.execute({
    sql: `INSERT INTO hypothesis_versions (id, hypcheck_id, version, statement, change_summary, source, created_at)
          VALUES (?, ?, 1, ?, NULL, 'initial', ?)`,
    args: [newId(), id, input.statement, now],
  });
  for (const m of input.metrics) {
    await db.execute({
      sql: "INSERT INTO metrics (id, hypcheck_id, name, description, weight) VALUES (?, ?, ?, ?, ?)",
      args: [newId(), id, m.name, m.description, m.weight],
    });
  }
  return (await getHypcheck(id))!;
}

export async function updateHypcheckSettings(
  id: string,
  patch: { name?: string; cadence?: Cadence; depth?: Depth; watchlist?: string[]; status?: "active" | "paused" }
): Promise<void> {
  const db = await getDb();
  const current = await getHypcheck(id);
  if (!current) throw new Error("Hypcheck not found");
  await db.execute({
    sql: `UPDATE hypchecks SET name = ?, cadence = ?, depth = ?, watchlist = ?, status = ? WHERE id = ?`,
    args: [
      patch.name ?? current.name,
      patch.cadence ?? current.cadence,
      patch.depth ?? current.depth,
      JSON.stringify(patch.watchlist ?? current.watchlist),
      patch.status ?? current.status,
      id,
    ],
  });
}

export async function deleteHypcheck(id: string): Promise<void> {
  const db = await getDb();
  // libsql does not enforce ON DELETE CASCADE unless foreign_keys pragma is on;
  // delete children explicitly.
  await db.execute({ sql: "DELETE FROM insights WHERE hypcheck_id = ?", args: [id] });
  await db.execute({ sql: "DELETE FROM runs WHERE hypcheck_id = ?", args: [id] });
  await db.execute({ sql: "DELETE FROM metrics WHERE hypcheck_id = ?", args: [id] });
  await db.execute({ sql: "DELETE FROM hypothesis_versions WHERE hypcheck_id = ?", args: [id] });
  await db.execute({ sql: "DELETE FROM hypchecks WHERE id = ?", args: [id] });
}

export async function setNextRun(id: string, cadence: Cadence, from: Date = new Date()): Promise<void> {
  const db = await getDb();
  const next = new Date(from.getTime() + CADENCE_DAYS[cadence] * 24 * 60 * 60 * 1000);
  await db.execute({ sql: "UPDATE hypchecks SET next_run_at = ? WHERE id = ?", args: [next.toISOString(), id] });
}

export async function listDueHypchecks(now: Date = new Date()): Promise<Hypcheck[]> {
  const db = await getDb();
  const res = await db.execute({
    sql: "SELECT * FROM hypchecks WHERE status = 'active' AND next_run_at IS NOT NULL AND next_run_at <= ?",
    args: [now.toISOString()],
  });
  return res.rows.map((r) => rowToHypcheck(r as Row));
}

// ---------------------------------------------------------------------------
// Hypothesis versions
// ---------------------------------------------------------------------------

export async function listVersions(hypcheckId: string): Promise<HypothesisVersion[]> {
  const db = await getDb();
  const res = await db.execute({
    sql: "SELECT * FROM hypothesis_versions WHERE hypcheck_id = ? ORDER BY version DESC",
    args: [hypcheckId],
  });
  return res.rows.map((r) => rowToVersion(r as Row));
}

export async function currentVersion(hypcheckId: string): Promise<HypothesisVersion> {
  const versions = await listVersions(hypcheckId);
  if (!versions.length) throw new Error("No hypothesis version");
  return versions[0];
}

export async function addVersion(
  hypcheckId: string,
  statement: string,
  changeSummary: string,
  source: VersionSource
): Promise<HypothesisVersion> {
  const db = await getDb();
  const latest = await currentVersion(hypcheckId);
  const id = newId();
  const now = new Date().toISOString();
  await db.execute({
    sql: `INSERT INTO hypothesis_versions (id, hypcheck_id, version, statement, change_summary, source, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, hypcheckId, latest.version + 1, statement, changeSummary, source, now],
  });
  return (await currentVersion(hypcheckId))!;
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export async function listMetrics(hypcheckId: string): Promise<Metric[]> {
  const db = await getDb();
  const res = await db.execute({
    sql: "SELECT * FROM metrics WHERE hypcheck_id = ? ORDER BY weight DESC, name",
    args: [hypcheckId],
  });
  return res.rows.map((r) => rowToMetric(r as Row));
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

export async function listRuns(hypcheckId: string): Promise<Run[]> {
  const db = await getDb();
  const res = await db.execute({
    sql: "SELECT * FROM runs WHERE hypcheck_id = ? ORDER BY run_at ASC",
    args: [hypcheckId],
  });
  return res.rows.map((r) => rowToRun(r as Row));
}

export async function getRun(runId: string): Promise<Run | null> {
  const db = await getDb();
  const res = await db.execute({ sql: "SELECT * FROM runs WHERE id = ?", args: [runId] });
  return res.rows[0] ? rowToRun(res.rows[0] as Row) : null;
}

export async function latestRun(hypcheckId: string): Promise<Run | null> {
  const db = await getDb();
  const res = await db.execute({
    sql: "SELECT * FROM runs WHERE hypcheck_id = ? ORDER BY run_at DESC LIMIT 1",
    args: [hypcheckId],
  });
  return res.rows[0] ? rowToRun(res.rows[0] as Row) : null;
}

export async function recordRun(
  hypcheckId: string,
  version: HypothesisVersion,
  mode: Run["mode"],
  result: RunResult,
  runAt: Date = new Date(),
  telemetry: Partial<RunTelemetry> = {}
): Promise<Run> {
  const db = await getDb();
  const runId = newId();
  const at = runAt.toISOString();
  await db.execute({
    sql: `INSERT INTO runs (id, hypcheck_id, hypothesis_version_id, hypothesis_version, run_at, mode,
            pmf_score, confidence, exec_summary, report_md, metric_scores,
            duration_ms, input_tokens, output_tokens, searches)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      runId,
      hypcheckId,
      version.id,
      version.version,
      at,
      mode,
      Math.round(result.pmfScore * 10) / 10,
      result.confidence,
      result.execSummary,
      result.reportMd,
      JSON.stringify(result.metricScores),
      telemetry.durationMs ?? null,
      telemetry.inputTokens ?? null,
      telemetry.outputTokens ?? null,
      telemetry.searches ?? null,
    ],
  });
  for (const ins of result.insights) {
    await db.execute({
      sql: `INSERT INTO insights (id, run_id, hypcheck_id, title, body, direction, proposed_revision, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?)`,
      args: [newId(), runId, hypcheckId, ins.title, ins.body, ins.direction, ins.proposedRevision, at],
    });
  }
  return (await getRun(runId))!;
}

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------

export async function listInsights(hypcheckId: string, status?: Insight["status"]): Promise<Insight[]> {
  const db = await getDb();
  const res = status
    ? await db.execute({
        sql: "SELECT * FROM insights WHERE hypcheck_id = ? AND status = ? ORDER BY created_at DESC",
        args: [hypcheckId, status],
      })
    : await db.execute({
        sql: "SELECT * FROM insights WHERE hypcheck_id = ? ORDER BY created_at DESC",
        args: [hypcheckId],
      });
  return res.rows.map((r) => rowToInsight(r as Row));
}

export async function listRunInsights(runId: string): Promise<Insight[]> {
  const db = await getDb();
  const res = await db.execute({
    sql: "SELECT * FROM insights WHERE run_id = ? ORDER BY created_at DESC",
    args: [runId],
  });
  return res.rows.map((r) => rowToInsight(r as Row));
}

export async function getInsight(id: string): Promise<Insight | null> {
  const db = await getDb();
  const res = await db.execute({ sql: "SELECT * FROM insights WHERE id = ?", args: [id] });
  return res.rows[0] ? rowToInsight(res.rows[0] as Row) : null;
}

export async function setInsightStatus(id: string, status: Insight["status"]): Promise<void> {
  const db = await getDb();
  await db.execute({ sql: "UPDATE insights SET status = ? WHERE id = ?", args: [status, id] });
}

export async function countPendingProposals(hypcheckId: string): Promise<number> {
  const db = await getDb();
  const res = await db.execute({
    sql: "SELECT COUNT(*) AS c FROM insights WHERE hypcheck_id = ? AND status = 'new' AND proposed_revision IS NOT NULL",
    args: [hypcheckId],
  });
  return Number((res.rows[0] as Row).c ?? 0);
}

// ---------------------------------------------------------------------------
// Observability
// ---------------------------------------------------------------------------

export interface DbStats {
  hypchecks: number;
  runs: number;
  insights: number;
  lastRun: Run | null;
}

/** Lightweight snapshot for the health endpoint; also exercises the DB connection. */
export async function getDbStats(): Promise<DbStats> {
  const db = await getDb();
  const [hc, rn, ins, last] = await Promise.all([
    db.execute("SELECT COUNT(*) AS c FROM hypchecks"),
    db.execute("SELECT COUNT(*) AS c FROM runs"),
    db.execute("SELECT COUNT(*) AS c FROM insights"),
    db.execute("SELECT * FROM runs ORDER BY run_at DESC LIMIT 1"),
  ]);
  return {
    hypchecks: Number((hc.rows[0] as Row).c ?? 0),
    runs: Number((rn.rows[0] as Row).c ?? 0),
    insights: Number((ins.rows[0] as Row).c ?? 0),
    lastRun: last.rows[0] ? rowToRun(last.rows[0] as Row) : null,
  };
}
