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
  next_run_at TEXT
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
  weight INTEGER NOT NULL DEFAULT 3
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
  searches INTEGER
);
CREATE TABLE IF NOT EXISTS insights (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  hypcheck_id TEXT NOT NULL REFERENCES hypchecks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'watch',
  proposed_revision TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_runs_hypcheck ON runs(hypcheck_id, run_at);
CREATE INDEX IF NOT EXISTS idx_insights_hypcheck ON insights(hypcheck_id, status);
CREATE INDEX IF NOT EXISTS idx_versions_hypcheck ON hypothesis_versions(hypcheck_id, version);
`;

/** Columns added after the initial schema shipped — applied to existing DBs. */
const MIGRATIONS: Record<string, Record<string, string>> = {
  runs: {
    duration_ms: "REAL",
    input_tokens: "INTEGER",
    output_tokens: "INTEGER",
    searches: "INTEGER",
  },
};

async function migrate(client: Client): Promise<void> {
  for (const [table, columns] of Object.entries(MIGRATIONS)) {
    const info = await client.execute(`PRAGMA table_info(${table})`);
    const existing = new Set(info.rows.map((r) => (r as Record<string, unknown>).name as string));
    for (const [column, type] of Object.entries(columns)) {
      if (!existing.has(column)) {
        await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
        logger.info("db.migrate.addColumn", { table, column, type });
      }
    }
  }
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
    for (const stmt of SCHEMA.split(";")) {
      const sql = stmt.trim();
      if (sql) await client.execute(sql);
    }
    await migrate(client);
    instrument(client);
    logger.info("db.init", { backend, ms: Date.now() - start });
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
