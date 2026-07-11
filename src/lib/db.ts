import { createClient, type Client, type InStatement } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";
import { logger, serializeError } from "./logger";

/** Queries slower than this (ms) are logged at warn for latency debugging. */
const SLOW_QUERY_MS = 500;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS hypchecks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  cadence TEXT NOT NULL DEFAULT 'weekly',
  depth TEXT NOT NULL DEFAULT 'standard',
  watchlist TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  next_run_at TEXT,
  owner_id TEXT REFERENCES "user"(id),
  refinement TEXT
);
CREATE TABLE IF NOT EXISTS hypcheck_access (
  id TEXT PRIMARY KEY,
  hypcheck_id TEXT NOT NULL REFERENCES hypchecks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  granted_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(hypcheck_id, user_id)
);
CREATE TABLE IF NOT EXISTS hypcheck_invitations (
  id TEXT PRIMARY KEY,
  hypcheck_id TEXT NOT NULL REFERENCES hypchecks(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  invited_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(hypcheck_id, email)
);
CREATE TABLE IF NOT EXISTS hypothesis_versions (
  id TEXT PRIMARY KEY,
  hypcheck_id TEXT NOT NULL REFERENCES hypchecks(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  statement TEXT NOT NULL,
  change_summary TEXT,
  source TEXT NOT NULL DEFAULT 'initial',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS metrics (
  id TEXT PRIMARY KEY,
  hypcheck_id TEXT NOT NULL REFERENCES hypchecks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  weight INTEGER NOT NULL DEFAULT 3,
  signals TEXT NOT NULL DEFAULT '',
  direction TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  hypcheck_id TEXT NOT NULL REFERENCES hypchecks(id) ON DELETE CASCADE,
  hypothesis_version_id TEXT NOT NULL,
  hypothesis_version INTEGER NOT NULL,
  run_at TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'simulated',
  pmf_score REAL NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.7,
  exec_summary TEXT NOT NULL,
  report_md TEXT NOT NULL,
  metric_scores TEXT NOT NULL DEFAULT '[]',
  duration_ms REAL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  searches INTEGER,
  industry_analysis TEXT,
  changes_summary TEXT
);
CREATE TABLE IF NOT EXISTS insights (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  hypcheck_id TEXT NOT NULL REFERENCES hypchecks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'watch',
  proposed_revision TEXT,
  proposed_watchlist_change TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS traces (
  id TEXT PRIMARY KEY,
  hypcheck_id TEXT REFERENCES hypchecks(id) ON DELETE CASCADE,
  run_id TEXT REFERENCES runs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  model TEXT NOT NULL,
  started_at TEXT NOT NULL,
  duration_ms REAL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  searches INTEGER,
  stop_reason TEXT,
  error TEXT,
  request_text TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS trace_spans (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL REFERENCES traces(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  start_ms REAL NOT NULL,
  duration_ms REAL NOT NULL,
  input_text TEXT,
  output_text TEXT
);
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS allowed_emails (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'member',
  added_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS "user" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "emailVerified" INTEGER NOT NULL DEFAULT 0,
  "image" TEXT,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'member'
);
CREATE TABLE IF NOT EXISTS "session" (
  "id" TEXT PRIMARY KEY,
  "expiresAt" DATE NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "account" (
  "id" TEXT PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" DATE,
  "refreshTokenExpiresAt" DATE,
  "scope" TEXT,
  "password" TEXT,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL
);
CREATE TABLE IF NOT EXISTS "verification" (
  "id" TEXT PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" DATE NOT NULL,
  "createdAt" DATE,
  "updatedAt" DATE
);
CREATE INDEX IF NOT EXISTS idx_session_userId ON "session"("userId");
CREATE INDEX IF NOT EXISTS idx_account_userId ON "account"("userId");
CREATE INDEX IF NOT EXISTS idx_runs_hypcheck ON runs(hypcheck_id, run_at);
CREATE INDEX IF NOT EXISTS idx_insights_hypcheck ON insights(hypcheck_id, status);
CREATE INDEX IF NOT EXISTS idx_versions_hypcheck ON hypothesis_versions(hypcheck_id, version);
CREATE INDEX IF NOT EXISTS idx_access_hypcheck ON hypcheck_access(hypcheck_id);
CREATE INDEX IF NOT EXISTS idx_access_user ON hypcheck_access(user_id);
CREATE INDEX IF NOT EXISTS idx_invitations_hypcheck ON hypcheck_invitations(hypcheck_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON hypcheck_invitations(email);
CREATE INDEX IF NOT EXISTS idx_allowed_emails_email ON allowed_emails(email);
CREATE INDEX IF NOT EXISTS idx_traces_hypcheck ON traces(hypcheck_id, started_at);
CREATE INDEX IF NOT EXISTS idx_traces_run ON traces(run_id);
CREATE INDEX IF NOT EXISTS idx_trace_spans_trace ON trace_spans(trace_id, seq);
`;

// Indexes on columns added via MIGRATIONS (below) rather than in the initial
// CREATE TABLE — run these AFTER migrate() so the column is guaranteed to
// exist. Bundling them into SCHEMA would break on any pre-existing DB, since
// the batch runs before migrate() adds the column.
const POST_MIGRATION_INDEXES = `CREATE INDEX IF NOT EXISTS idx_hypchecks_owner ON hypchecks(owner_id);`;

/** Columns added after the initial schema shipped — applied to existing DBs. */
const MIGRATIONS: Record<string, Record<string, string>> = {
  runs: {
    duration_ms: "REAL",
    input_tokens: "INTEGER",
    output_tokens: "INTEGER",
    searches: "INTEGER",
    industry_analysis: "TEXT",
    changes_summary: "TEXT",
  },
  hypchecks: {
    owner_id: "TEXT",
    refinement: "TEXT",
    model: "TEXT", // ModelFamily; null = default (sonnet)
  },
  metrics: {
    signals: "TEXT NOT NULL DEFAULT ''",
    direction: "TEXT NOT NULL DEFAULT ''",
  },
  insights: {
    proposed_watchlist_change: "TEXT",
  },
  user: {
    role: "TEXT NOT NULL DEFAULT 'member'",
    model_access: "TEXT", // JSON array of extra ModelFamily grants beyond the base set; null = none
  },
};

async function migrate(client: Client): Promise<void> {
  for (const [table, columns] of Object.entries(MIGRATIONS)) {
    const info = await client.execute(`PRAGMA table_info("${table}")`);
    const existing = new Set(info.rows.map((r) => (r as Record<string, unknown>).name as string));
    for (const [column, type] of Object.entries(columns)) {
      if (!existing.has(column)) {
        await client.execute(`ALTER TABLE "${table}" ADD COLUMN ${column} ${type}`);
        logger.info("db.migrate.addColumn", { table, column, type });
        // Phase 2 role rollout: the "role" column didn't exist before, so every
        // pre-existing account predates per-hypcheck access control and had
        // full access by construction — grandfather them all in as admin
        // rather than silently locking them down to "member".
        if (table === "user" && column === "role") {
          await client.execute(`UPDATE "user" SET role = 'admin'`);
          logger.info("db.migrate.backfillAdmin", {});
        }
      }
    }
  }
}

/**
 * The allowed_emails table gates sign-in the same way ALLOWED_EMAILS always
 * has (see auth.ts isEmailAllowed) — so on the database that first sees this
 * table, every account that already exists must be backfilled in, or their
 * next request would find them suddenly locked out. Runs exactly once per
 * database (guarded by the pre-existence check in init()), so an admin who
 * later empties the table on purpose to revoke everyone doesn't get
 * silently undone on the next cold start.
 */
async function backfillAllowedEmails(client: Client): Promise<void> {
  const users = await client.execute(`SELECT id, email, role FROM "user"`);
  if (users.rows.length === 0) return;
  const now = new Date().toISOString();
  await client.batch(
    users.rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        sql: `INSERT OR IGNORE INTO allowed_emails (id, email, role, added_by, created_at) VALUES (?, ?, ?, 'migration', ?)`,
        args: [newId(), (row.email as string).toLowerCase(), row.role as string, now],
      };
    }),
    "write"
  );
  logger.info("db.migrate.backfillAllowedEmails", { count: users.rows.length });
}

function stmtText(stmt: InStatement): string {
  const sql = typeof stmt === "string" ? stmt : stmt.sql;
  return sql.replace(/\s+/g, " ").trim().slice(0, 120);
}

/** Wrap execute() so slow queries surface in logs without touching call sites. */
function instrument(client: Client): void {
  const raw = client.execute.bind(client);
  (client as unknown as { execute: Client["execute"] }).execute = (async (stmt: InStatement) => {
    const start = Date.now();
    try {
      return await raw(stmt);
    } finally {
      const ms = Date.now() - start;
      if (ms >= SLOW_QUERY_MS) logger.warn("db.slow", { ms, sql: stmtText(stmt) });
    }
  }) as Client["execute"];
}

let clientPromise: Promise<Client> | null = null;

async function init(): Promise<Client> {
  const start = Date.now();
  let client: Client;
  let backend: "turso" | "file";
  if (process.env.TURSO_DATABASE_URL) {
    backend = "turso";
    client = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  } else {
    backend = "file";
    const dir = path.join(process.cwd(), "data");
    fs.mkdirSync(dir, { recursive: true });
    client = createClient({ url: `file:${path.join(dir, "hypcheck.db")}` });
  }
  try {
    // Checked before the schema batch creates the table, so this only fires
    // once — the first time this database sees allowed_emails at all.
    const preExisting = await client.execute(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'allowed_emails'`
    );
    const allowedEmailsIsNew = preExisting.rows.length === 0;

    // Batch the schema (idempotent CREATEs) into ONE round trip. Sequential
    // execution was ~13 round trips — punishing on a cross-region DB and a
    // prime suspect for cold-start functions exceeding their time budget.
    const schemaStatements = SCHEMA.split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    await client.batch(schemaStatements, "write");
    await migrate(client);
    await client.execute(POST_MIGRATION_INDEXES);
    if (allowedEmailsIsNew) await backfillAllowedEmails(client);
    instrument(client);
    logger.info("db.init", { backend, ms: Date.now() - start, statements: schemaStatements.length });
    return client;
  } catch (err) {
    logger.error("db.init.fail", { backend, err: serializeError(err) });
    // Reset so a transient init failure can be retried on the next getDb().
    clientPromise = null;
    throw err;
  }
}

export function getDb(): Promise<Client> {
  if (!clientPromise) clientPromise = init();
  return clientPromise;
}

export function newId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}
