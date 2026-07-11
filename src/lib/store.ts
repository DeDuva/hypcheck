import { getDb, newId } from "./db";
import type {
  AllowedEmail,
  Cadence,
  Depth,
  GlobalRole,
  GrantRole,
  Hypcheck,
  HypcheckAccessGrant,
  HypcheckInvitation,
  HypothesisVersion,
  Insight,
  InsightDirection,
  Metric,
  MetricScore,
  ModelFamily,
  RefinementNotes,
  Run,
  RunResult,
  RunTelemetry,
  SpanInput,
  Trace,
  TraceKind,
  TraceSpan,
  TraceSpanKind,
  VersionSource,
  WatchlistChange,
  WatchlistEntry,
} from "./types";
import { CADENCE_DAYS, DEFAULT_MODEL_FAMILY, GRANTABLE_MODEL_FAMILIES } from "./types";

type Row = Record<string, unknown>;

/** Watchlists stored before phase 3 are plain string arrays — normalize both
 * shapes to WatchlistEntry so callers never see the difference. `category` is
 * absent on entries created before that field existed or added manually. */
function parseWatchlist(json: string): WatchlistEntry[] {
  const raw = JSON.parse(json || "[]") as Array<string | { name?: string; reason?: string; category?: WatchlistEntry["category"] }>;
  return raw
    .map((e) =>
      typeof e === "string"
        ? { name: e, reason: "" }
        : { name: e.name ?? "", reason: e.reason ?? "", category: e.category }
    )
    .filter((e) => e.name);
}

function rowToHypcheck(r: Row): Hypcheck {
  return {
    id: r.id as string,
    name: r.name as string,
    status: r.status as Hypcheck["status"],
    cadence: r.cadence as Cadence,
    depth: r.depth as Depth,
    model: (r.model as ModelFamily) ?? DEFAULT_MODEL_FAMILY,
    watchlist: parseWatchlist(r.watchlist as string),
    createdAt: r.created_at as string,
    nextRunAt: (r.next_run_at as string) ?? null,
    ownerId: (r.owner_id as string) ?? null,
    refinement: r.refinement ? (JSON.parse(r.refinement as string) as RefinementNotes) : null,
  };
}

/** Parse a user's model_access JSON column into a clean extra-grants list. */
function parseModelAccess(raw: unknown): ModelFamily[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((f): f is ModelFamily => GRANTABLE_MODEL_FAMILIES.includes(f as ModelFamily));
  } catch {
    return [];
  }
}

function rowToGrant(r: Row): HypcheckAccessGrant {
  return {
    id: r.id as string,
    hypcheckId: r.hypcheck_id as string,
    userId: r.user_id as string,
    role: r.role as GrantRole,
    grantedBy: r.granted_by as string,
    createdAt: r.created_at as string,
  };
}

function rowToInvitation(r: Row): HypcheckInvitation {
  return {
    id: r.id as string,
    hypcheckId: r.hypcheck_id as string,
    email: r.email as string,
    role: r.role as GrantRole,
    invitedBy: r.invited_by as string,
    createdAt: r.created_at as string,
  };
}

function rowToAllowedEmail(r: Row): AllowedEmail {
  return {
    id: r.id as string,
    email: r.email as string,
    role: r.role as GlobalRole,
    addedBy: r.added_by as string,
    createdAt: r.created_at as string,
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
    signals: (r.signals as string) ?? "",
    direction: (r.direction as string) ?? "",
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
    industryAnalysis: r.industry_analysis ? (JSON.parse(r.industry_analysis as string) as Run["industryAnalysis"]) : null,
    changesSinceLastRun: (r.changes_summary as string) ?? null,
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
    proposedWatchlistChange: r.proposed_watchlist_change
      ? (JSON.parse(r.proposed_watchlist_change as string) as WatchlistChange)
      : null,
    status: r.status as Insight["status"],
    createdAt: r.created_at as string,
  };
}

function rowToTrace(r: Row): Trace {
  return {
    id: r.id as string,
    hypcheckId: (r.hypcheck_id as string) ?? null,
    runId: (r.run_id as string) ?? null,
    kind: r.kind as TraceKind,
    status: r.status as Trace["status"],
    model: r.model as string,
    startedAt: r.started_at as string,
    durationMs: r.duration_ms == null ? null : Number(r.duration_ms),
    inputTokens: r.input_tokens == null ? null : Number(r.input_tokens),
    outputTokens: r.output_tokens == null ? null : Number(r.output_tokens),
    searches: r.searches == null ? null : Number(r.searches),
    stopReason: (r.stop_reason as string) ?? null,
    error: (r.error as string) ?? null,
    requestText: r.request_text as string,
  };
}

function rowToTraceSpan(r: Row): TraceSpan {
  return {
    id: r.id as string,
    traceId: r.trace_id as string,
    seq: Number(r.seq),
    kind: r.kind as TraceSpanKind,
    label: r.label as string,
    startMs: Number(r.start_ms),
    durationMs: Number(r.duration_ms),
    inputText: (r.input_text as string) ?? null,
    outputText: (r.output_text as string) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Hypchecks
// ---------------------------------------------------------------------------

/**
 * Data-scoped listing: admins see everything, everyone else sees hypchecks
 * they own, are explicitly granted access to, or that predate ownership
 * (owner_id IS NULL — grandfathered shared hypchecks, see effectiveHypcheckRole).
 */
export async function listHypchecks(viewer: { id: string; role: string }): Promise<Hypcheck[]> {
  const db = await getDb();
  if (viewer.role === "admin") {
    const res = await db.execute("SELECT * FROM hypchecks ORDER BY created_at DESC");
    return res.rows.map((r) => rowToHypcheck(r as Row));
  }
  const res = await db.execute({
    sql: `SELECT h.* FROM hypchecks h
          WHERE h.owner_id IS NULL
             OR h.owner_id = ?
             OR EXISTS (SELECT 1 FROM hypcheck_access a WHERE a.hypcheck_id = h.id AND a.user_id = ?)
          ORDER BY h.created_at DESC`,
    args: [viewer.id, viewer.id],
  });
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
  /** Model family for research runs. Callers pass the best family the creator is allowed. */
  model?: ModelFamily;
  watchlist: WatchlistEntry[];
  metrics: Array<{ name: string; description: string; weight: number; signals?: string; direction?: string }>;
  refinement?: RefinementNotes | null;
}

export async function createHypcheck(input: CreateHypcheckInput, ownerId: string): Promise<Hypcheck> {
  const db = await getDb();
  const id = newId();
  const now = new Date().toISOString();
  await db.execute({
    sql: `INSERT INTO hypchecks (id, name, status, cadence, depth, model, watchlist, created_at, next_run_at, owner_id, refinement)
          VALUES (?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      input.name,
      input.cadence,
      input.depth,
      input.model ?? DEFAULT_MODEL_FAMILY,
      JSON.stringify(input.watchlist),
      now,
      now,
      ownerId,
      input.refinement ? JSON.stringify(input.refinement) : null,
    ],
  });
  await db.execute({
    sql: `INSERT INTO hypothesis_versions (id, hypcheck_id, version, statement, change_summary, source, created_at)
          VALUES (?, ?, 1, ?, NULL, 'initial', ?)`,
    args: [newId(), id, input.statement, now],
  });
  for (const m of input.metrics) {
    await db.execute({
      sql: "INSERT INTO metrics (id, hypcheck_id, name, description, weight, signals, direction) VALUES (?, ?, ?, ?, ?, ?, ?)",
      args: [newId(), id, m.name, m.description, m.weight, m.signals ?? "", m.direction ?? ""],
    });
  }
  return (await getHypcheck(id))!;
}

export async function updateHypcheckSettings(
  id: string,
  patch: {
    name?: string;
    cadence?: Cadence;
    depth?: Depth;
    model?: ModelFamily;
    watchlist?: WatchlistEntry[];
    status?: "active" | "paused";
  }
): Promise<void> {
  const db = await getDb();
  const current = await getHypcheck(id);
  if (!current) throw new Error("Hypcheck not found");
  await db.execute({
    sql: `UPDATE hypchecks SET name = ?, cadence = ?, depth = ?, model = ?, watchlist = ?, status = ? WHERE id = ?`,
    args: [
      patch.name ?? current.name,
      patch.cadence ?? current.cadence,
      patch.depth ?? current.depth,
      patch.model ?? current.model,
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
// Access grants (hypcheck_access) — per-hypcheck editor/viewer sharing.
// ---------------------------------------------------------------------------

export async function getAccessGrant(hypcheckId: string, userId: string): Promise<HypcheckAccessGrant | null> {
  const db = await getDb();
  const res = await db.execute({
    sql: "SELECT * FROM hypcheck_access WHERE hypcheck_id = ? AND user_id = ?",
    args: [hypcheckId, userId],
  });
  return res.rows[0] ? rowToGrant(res.rows[0] as Row) : null;
}

export async function listAccessGrants(hypcheckId: string): Promise<HypcheckAccessGrant[]> {
  const db = await getDb();
  const res = await db.execute({
    sql: "SELECT * FROM hypcheck_access WHERE hypcheck_id = ? ORDER BY created_at ASC",
    args: [hypcheckId],
  });
  return res.rows.map((r) => rowToGrant(r as Row));
}

export async function grantAccess(
  hypcheckId: string,
  userId: string,
  role: GrantRole,
  grantedBy: string
): Promise<void> {
  const db = await getDb();
  await db.execute({
    sql: `INSERT INTO hypcheck_access (id, hypcheck_id, user_id, role, granted_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(hypcheck_id, user_id) DO UPDATE SET role = excluded.role, granted_by = excluded.granted_by`,
    args: [newId(), hypcheckId, userId, role, grantedBy, new Date().toISOString()],
  });
}

export async function revokeAccess(hypcheckId: string, userId: string): Promise<void> {
  const db = await getDb();
  await db.execute({
    sql: "DELETE FROM hypcheck_access WHERE hypcheck_id = ? AND user_id = ?",
    args: [hypcheckId, userId],
  });
}

/** Idempotently create a user row. Dev open mode's synthetic viewer needs a
 * real row because hypchecks.owner_id has a FOREIGN KEY to "user"(id), which
 * the local sqlite client enforces. */
export async function ensureUserRow(u: { id: string; email: string; name: string; role: string }): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute({
    sql: `INSERT OR IGNORE INTO "user" ("id", "name", "email", "emailVerified", "image", "createdAt", "updatedAt", "role")
          VALUES (?, ?, ?, 1, NULL, ?, ?, ?)`,
    args: [u.id, u.name, u.email, now, now, u.role],
  });
}

export async function getUserByEmail(email: string): Promise<{ id: string; email: string; name: string } | null> {
  const db = await getDb();
  const res = await db.execute({ sql: `SELECT id, email, name FROM "user" WHERE email = ?`, args: [email] });
  const row = res.rows[0] as Row | undefined;
  return row ? { id: row.id as string, email: row.email as string, name: row.name as string } : null;
}

export async function getUserById(userId: string): Promise<{ id: string; email: string; name: string } | null> {
  const db = await getDb();
  const res = await db.execute({ sql: `SELECT id, email, name FROM "user" WHERE id = ?`, args: [userId] });
  const row = res.rows[0] as Row | undefined;
  return row ? { id: row.id as string, email: row.email as string, name: row.name as string } : null;
}

export interface UserSummary {
  id: string;
  email: string;
  name: string;
  role: GlobalRole;
  createdAt: string;
  modelAccess: ModelFamily[]; // extra families granted beyond the base set
}

/** Every account, for the global admin console. */
export async function listUsers(): Promise<UserSummary[]> {
  const db = await getDb();
  const res = await db.execute(`SELECT id, email, name, role, model_access, "createdAt" FROM "user" ORDER BY "createdAt" ASC`);
  return res.rows.map((r) => {
    const row = r as Row;
    return {
      id: row.id as string,
      email: row.email as string,
      name: row.name as string,
      role: row.role as GlobalRole,
      createdAt: row.createdAt as string,
      modelAccess: parseModelAccess(row.model_access),
    };
  });
}

/** Change a user's global role — the only way to promote someone to creator/admin. */
export async function updateUserRole(userId: string, role: GlobalRole): Promise<void> {
  const db = await getDb();
  await db.execute({
    sql: `UPDATE "user" SET role = ?, "updatedAt" = ? WHERE id = ?`,
    args: [role, new Date().toISOString(), userId],
  });
}

/** Extra model-family grants for one user (admin-managed; base families need no grant). */
export async function getModelAccess(userId: string): Promise<ModelFamily[]> {
  const db = await getDb();
  const res = await db.execute({ sql: `SELECT model_access FROM "user" WHERE id = ?`, args: [userId] });
  return parseModelAccess((res.rows[0] as Row | undefined)?.model_access);
}

/** Replace a user's extra model-family grants (admin console). */
export async function updateModelAccess(userId: string, extras: ModelFamily[]): Promise<void> {
  const db = await getDb();
  const clean = [...new Set(extras.filter((f) => GRANTABLE_MODEL_FAMILIES.includes(f)))];
  await db.execute({
    sql: `UPDATE "user" SET model_access = ?, "updatedAt" = ? WHERE id = ?`,
    args: [clean.length ? JSON.stringify(clean) : null, new Date().toISOString(), userId],
  });
}

export interface HypcheckAccessGrantWithUser extends HypcheckAccessGrant {
  email: string;
  name: string;
}

/** Grants joined with the grantee's identity, for rendering the sharing list. */
export async function listAccessGrantsWithUsers(hypcheckId: string): Promise<HypcheckAccessGrantWithUser[]> {
  const db = await getDb();
  const res = await db.execute({
    sql: `SELECT ha.*, u.email AS grantee_email, u.name AS grantee_name
          FROM hypcheck_access ha
          JOIN "user" u ON u.id = ha.user_id
          WHERE ha.hypcheck_id = ?
          ORDER BY ha.created_at ASC`,
    args: [hypcheckId],
  });
  return res.rows.map((r) => {
    const row = r as Row;
    return { ...rowToGrant(row), email: row.grantee_email as string, name: row.grantee_name as string };
  });
}

// ---------------------------------------------------------------------------
// Invitations (hypcheck_invitations) — access granted to an email before that
// person has ever signed in. Activated into a real hypcheck_access grant on
// their first login (see the user.create.after hook in auth.ts).
// ---------------------------------------------------------------------------

export async function createInvitation(
  hypcheckId: string,
  email: string,
  role: GrantRole,
  invitedBy: string
): Promise<void> {
  const db = await getDb();
  await db.execute({
    sql: `INSERT INTO hypcheck_invitations (id, hypcheck_id, email, role, invited_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(hypcheck_id, email) DO UPDATE SET role = excluded.role, invited_by = excluded.invited_by`,
    args: [newId(), hypcheckId, email, role, invitedBy, new Date().toISOString()],
  });
}

export async function listInvitations(hypcheckId: string): Promise<HypcheckInvitation[]> {
  const db = await getDb();
  const res = await db.execute({
    sql: "SELECT * FROM hypcheck_invitations WHERE hypcheck_id = ? ORDER BY created_at ASC",
    args: [hypcheckId],
  });
  return res.rows.map((r) => rowToInvitation(r as Row));
}

export async function revokeInvitation(hypcheckId: string, email: string): Promise<void> {
  const db = await getDb();
  await db.execute({
    sql: "DELETE FROM hypcheck_invitations WHERE hypcheck_id = ? AND email = ?",
    args: [hypcheckId, email],
  });
}

/** Convert every pending invitation for `email` into a real access grant for
 * the newly-created `userId`, then clear those invitations. Idempotent. */
export async function activatePendingInvitations(userId: string, email: string): Promise<number> {
  const db = await getDb();
  const res = await db.execute({
    sql: "SELECT * FROM hypcheck_invitations WHERE email = ?",
    args: [email],
  });
  const invitations = res.rows.map((r) => rowToInvitation(r as Row));
  for (const invite of invitations) {
    await grantAccess(invite.hypcheckId, userId, invite.role, invite.invitedBy);
  }
  await db.execute({ sql: "DELETE FROM hypcheck_invitations WHERE email = ?", args: [email] });
  return invitations.length;
}

// ---------------------------------------------------------------------------
// Allowed emails (allowed_emails) — the DB-backed, admin-editable invite
// list. Gates sign-in the same way the ALLOWED_EMAILS env var always has
// (see auth.ts isEmailAllowed); the env var still works as a parallel,
// deploy-time bootstrap path for the very first admin.
// ---------------------------------------------------------------------------

export async function listAllowedEmails(): Promise<AllowedEmail[]> {
  const db = await getDb();
  const res = await db.execute("SELECT * FROM allowed_emails ORDER BY created_at ASC");
  return res.rows.map((r) => rowToAllowedEmail(r as Row));
}

export async function getAllowedEmail(email: string): Promise<AllowedEmail | null> {
  const db = await getDb();
  const res = await db.execute({
    sql: "SELECT * FROM allowed_emails WHERE email = ?",
    args: [email.trim().toLowerCase()],
  });
  return res.rows[0] ? rowToAllowedEmail(res.rows[0] as Row) : null;
}

/** Add or re-invite an email at a given starting role. Idempotent — adding
 * an already-allowed email updates its role rather than erroring. */
export async function addAllowedEmail(email: string, role: GlobalRole, addedBy: string): Promise<void> {
  const db = await getDb();
  await db.execute({
    sql: `INSERT INTO allowed_emails (id, email, role, added_by, created_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(email) DO UPDATE SET role = excluded.role, added_by = excluded.added_by`,
    args: [newId(), email.trim().toLowerCase(), role, addedBy, new Date().toISOString()],
  });
}

/** Revoke an email's access. Checked on every request (getViewer), so this
 * signs an already-active user out on their very next one. */
export async function removeAllowedEmail(email: string): Promise<void> {
  const db = await getDb();
  await db.execute({ sql: "DELETE FROM allowed_emails WHERE email = ?", args: [email.trim().toLowerCase()] });
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
  const pmfScore = Math.round(result.pmfScore * 10) / 10;
  const telem: RunTelemetry = {
    durationMs: telemetry.durationMs ?? null,
    inputTokens: telemetry.inputTokens ?? null,
    outputTokens: telemetry.outputTokens ?? null,
    searches: telemetry.searches ?? null,
  };

  // Single batched write (run + all insights) rather than N+1 sequential
  // round-trips — matters on a high-latency DB. Return is built in memory to
  // avoid a follow-up read.
  const statements = [
    {
      sql: `INSERT INTO runs (id, hypcheck_id, hypothesis_version_id, hypothesis_version, run_at, mode,
              pmf_score, confidence, exec_summary, report_md, metric_scores,
              duration_ms, input_tokens, output_tokens, searches, industry_analysis, changes_summary)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        runId,
        hypcheckId,
        version.id,
        version.version,
        at,
        mode,
        pmfScore,
        result.confidence,
        result.execSummary,
        result.reportMd,
        JSON.stringify(result.metricScores),
        telem.durationMs,
        telem.inputTokens,
        telem.outputTokens,
        telem.searches,
        result.industryAnalysis ? JSON.stringify(result.industryAnalysis) : null,
        result.changesSinceLastRun ?? null,
      ],
    },
    ...result.insights.map((ins) => ({
      sql: `INSERT INTO insights (id, run_id, hypcheck_id, title, body, direction, proposed_revision, proposed_watchlist_change, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)`,
      args: [
        newId(),
        runId,
        hypcheckId,
        ins.title,
        ins.body,
        ins.direction,
        ins.proposedRevision,
        ins.proposedWatchlistChange ? JSON.stringify(ins.proposedWatchlistChange) : null,
        at,
      ],
    })),
  ];
  await db.batch(statements, "write");

  return {
    id: runId,
    hypcheckId,
    hypothesisVersionId: version.id,
    hypothesisVersion: version.version,
    runAt: at,
    mode,
    pmfScore,
    confidence: result.confidence,
    execSummary: result.execSummary,
    reportMd: result.reportMd,
    metricScores: result.metricScores,
    industryAnalysis: result.industryAnalysis,
    changesSinceLastRun: result.changesSinceLastRun ?? null,
    telemetry: telem,
  };
}

// ---------------------------------------------------------------------------
// Traces (API-call profiling)
// ---------------------------------------------------------------------------

export interface NewTrace {
  hypcheckId: string | null;
  kind: TraceKind;
  model: string;
  startedAt: Date;
  requestText: string;
  durationMs: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
  searches?: number | null;
  stopReason?: string | null;
}

function traceInsertStatements(id: string, status: Trace["status"], trace: NewTrace, spans: SpanInput[], error: string | null) {
  return [
    {
      sql: `INSERT INTO traces (id, hypcheck_id, run_id, kind, status, model, started_at, duration_ms, input_tokens, output_tokens, searches, stop_reason, error, request_text)
            VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        trace.hypcheckId,
        trace.kind,
        status,
        trace.model,
        trace.startedAt.toISOString(),
        trace.durationMs,
        trace.inputTokens ?? null,
        trace.outputTokens ?? null,
        trace.searches ?? null,
        trace.stopReason ?? null,
        error,
        trace.requestText,
      ],
    },
    ...spans.map((s, i) => ({
      sql: `INSERT INTO trace_spans (id, trace_id, seq, kind, label, start_ms, duration_ms, input_text, output_text)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [newId(), id, i, s.kind, s.label, s.startMs, s.durationMs, s.inputText, s.outputText],
    })),
  ];
}

/** Persist a completed trace + its spans in one batched write. Returns the new trace id. */
export async function recordTrace(trace: NewTrace, spans: SpanInput[]): Promise<string> {
  const db = await getDb();
  const id = newId();
  await db.batch(traceInsertStatements(id, "ok", trace, spans, null), "write");
  return id;
}

/** Same as recordTrace, but marks the trace as failed with the given error message. */
export async function recordTraceError(trace: NewTrace, spans: SpanInput[], error: string): Promise<string> {
  const db = await getDb();
  const id = newId();
  await db.batch(traceInsertStatements(id, "error", trace, spans, error), "write");
  return id;
}

/** Backfill run_id once the run row exists — liveRun finishes before recordRun runs. */
export async function linkTraceToRun(traceId: string, runId: string): Promise<void> {
  const db = await getDb();
  await db.execute({ sql: `UPDATE traces SET run_id = ? WHERE id = ?`, args: [runId, traceId] });
}

export async function listTraces(opts: { hypcheckId?: string; limit?: number } = {}): Promise<Trace[]> {
  const db = await getDb();
  const limit = opts.limit ?? 100;
  const res = opts.hypcheckId
    ? await db.execute({
        sql: `SELECT * FROM traces WHERE hypcheck_id = ? ORDER BY started_at DESC LIMIT ?`,
        args: [opts.hypcheckId, limit],
      })
    : await db.execute({ sql: `SELECT * FROM traces ORDER BY started_at DESC LIMIT ?`, args: [limit] });
  return res.rows.map((r) => rowToTrace(r as Row));
}

export async function getTraceDetail(id: string): Promise<{ trace: Trace; spans: TraceSpan[] } | null> {
  const db = await getDb();
  const [traceRes, spanRes] = await Promise.all([
    db.execute({ sql: `SELECT * FROM traces WHERE id = ?`, args: [id] }),
    db.execute({ sql: `SELECT * FROM trace_spans WHERE trace_id = ? ORDER BY seq ASC`, args: [id] }),
  ]);
  if (!traceRes.rows[0]) return null;
  return {
    trace: rowToTrace(traceRes.rows[0] as Row),
    spans: spanRes.rows.map((r) => rowToTraceSpan(r as Row)),
  };
}

/** hypcheck id + name for traces list rendering — small lookup table, not worth a JOIN per row. */
export async function hypcheckNamesById(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const db = await getDb();
  const placeholders = unique.map(() => "?").join(",");
  const res = await db.execute({ sql: `SELECT id, name FROM hypchecks WHERE id IN (${placeholders})`, args: unique });
  return new Map(res.rows.map((r) => [(r as Row).id as string, (r as Row).name as string]));
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
    sql: `SELECT COUNT(*) AS c FROM insights
          WHERE hypcheck_id = ? AND status = 'new'
            AND (proposed_revision IS NOT NULL OR proposed_watchlist_change IS NOT NULL)`,
    args: [hypcheckId],
  });
  return Number((res.rows[0] as Row).c ?? 0);
}

/** Apply an accepted watchlist change to the hypcheck. Idempotent: re-adding
 * an existing name updates its reason; removing a missing name is a no-op. */
export async function applyWatchlistChange(hypcheckId: string, change: WatchlistChange): Promise<void> {
  const hypcheck = await getHypcheck(hypcheckId);
  if (!hypcheck) throw new Error("Hypcheck not found");
  const rest = hypcheck.watchlist.filter((w) => w.name.toLowerCase() !== change.name.toLowerCase());
  const watchlist =
    change.action === "add" ? [...rest, { name: change.name, reason: change.reason }] : rest;
  await updateHypcheckSettings(hypcheckId, { watchlist });
}

// ---------------------------------------------------------------------------
// Observability
// ---------------------------------------------------------------------------

/**
 * Last run attempt, persisted so failures are visible on /api/health without
 * reading platform logs. A "running" record that never advances to ok/error
 * means the function was killed mid-run (hard timeout).
 */
export interface RunAttempt {
  status: "running" | "ok" | "error";
  hypcheckId: string;
  hypcheckName: string;
  model: string;
  startedAt: string;
  phase?: string; // coarse progress within a running attempt (e.g. research_done)
  researchMs?: number;
  finishedAt?: string;
  durationMs?: number;
  mode?: string;
  score?: number;
  fellBack?: boolean;
  error?: Record<string, unknown>;
}

export async function setLastRunAttempt(a: RunAttempt): Promise<void> {
  const db = await getDb();
  await db.execute({
    sql: `INSERT INTO app_meta (key, value, updated_at) VALUES ('last_run_attempt', ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    args: [JSON.stringify(a), new Date().toISOString()],
  });
}

/** Probe whether the DB accepts writes (reads can succeed while writes fail). */
export async function probeWrite(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const db = await getDb();
  const start = Date.now();
  try {
    await db.execute({
      sql: `INSERT INTO app_meta (key, value, updated_at) VALUES ('health_probe', ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      args: [new Date().toISOString(), new Date().toISOString()],
    });
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: String(err) };
  }
}

export async function getLastRunAttempt(): Promise<(RunAttempt & { updatedAt: string }) | null> {
  const db = await getDb();
  const res = await db.execute("SELECT value, updated_at FROM app_meta WHERE key = 'last_run_attempt'");
  const row = res.rows[0] as Row | undefined;
  if (!row) return null;
  return { ...(JSON.parse(row.value as string) as RunAttempt), updatedAt: row.updated_at as string };
}

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
