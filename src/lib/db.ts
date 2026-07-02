import { createClient, type Client } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";

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
  metric_scores TEXT NOT NULL DEFAULT '[]'
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

let clientPromise: Promise<Client> | null = null;

async function init(): Promise<Client> {
  let client: Client;
  if (process.env.TURSO_DATABASE_URL) {
    client = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  } else {
    const dir = path.join(process.cwd(), "data");
    fs.mkdirSync(dir, { recursive: true });
    client = createClient({ url: `file:${path.join(dir, "hypcheck.db")}` });
  }
  for (const stmt of SCHEMA.split(";")) {
    const sql = stmt.trim();
    if (sql) await client.execute(sql);
  }
  return client;
}

export function getDb(): Promise<Client> {
  if (!clientPromise) clientPromise = init();
  return clientPromise;
}

export function newId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}
