import { NextResponse } from "next/server";
import { getDbStats, getLastRunAttempt, probeWrite, type RunAttempt } from "@/lib/store";
import { engineInfo } from "@/lib/engine";
import { getViewer } from "@/lib/authz";
import { logger, newRequestId, serializeError } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Debug/health snapshot. Hit this first when something looks wrong in a
 * deployment: it reports the deploy commit, engine mode/model, DB backend and
 * connectivity, row counts, and the latest run's telemetry (duration + tokens)
 * — which is exactly what you need to diagnose the recurring "runs time out"
 * failure mode. Exposes no secrets (only booleans and the model name).
 */
export async function GET(request: Request) {
  const log = logger.child({ route: "health", reqId: newRequestId() });

  // Unauthenticated callers get a bare liveness ping only — the detailed body
  // (row counts, engine mode, run telemetry) is internal.
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ ok: true, time: new Date().toISOString() });
  }

  const engine = engineInfo();
  const backend = process.env.TURSO_DATABASE_URL ? "turso" : "file";
  // Opt-in write probe (?write=1) — reads can succeed while writes fail.
  const wantWriteProbe = new URL(request.url).searchParams.get("write") === "1";
  let writeProbe: { ok: boolean; latencyMs: number; error?: string } | null = null;

  let db: { backend: string; ok: boolean; latencyMs: number | null; error?: string };
  let counts: { hypchecks: number; runs: number; insights: number } | null = null;
  let lastRun: {
    at: string;
    mode: string;
    score: number;
    durationMs: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    searches: number | null;
  } | null = null;

  let lastAttempt: (RunAttempt & { updatedAt: string; stale?: boolean }) | null = null;

  const start = Date.now();
  try {
    const stats = await getDbStats();
    db = { backend, ok: true, latencyMs: Date.now() - start };
    counts = { hypchecks: stats.hypchecks, runs: stats.runs, insights: stats.insights };
    const attempt = await getLastRunAttempt();
    if (attempt) {
      // Runs execute on GitHub Actions (research.yml). A "queued" attempt no
      // runner picked up within 10 min, or a "running" one older than 20 min
      // (the engine aborts research at 10), never finished — check the
      // workflow's run log.
      const ageMs = Date.now() - new Date(attempt.updatedAt ?? attempt.startedAt).getTime();
      const staleAfterMs = attempt.status === "queued" ? 10 * 60_000 : 20 * 60_000;
      lastAttempt = {
        ...attempt,
        stale: (attempt.status === "queued" || attempt.status === "running") && ageMs > staleAfterMs,
      };
    }
    if (wantWriteProbe) writeProbe = await probeWrite();
    if (stats.lastRun) {
      const r = stats.lastRun;
      lastRun = {
        at: r.runAt,
        mode: r.mode,
        score: r.pmfScore,
        durationMs: r.telemetry.durationMs,
        inputTokens: r.telemetry.inputTokens,
        outputTokens: r.telemetry.outputTokens,
        searches: r.telemetry.searches,
      };
    }
  } catch (err) {
    log.error("health.db.fail", { err: serializeError(err) });
    db = { backend, ok: false, latencyMs: null, error: String(err) };
  }

  const body = {
    ok: db.ok,
    time: new Date().toISOString(),
    env: process.env.VERCEL_ENV ?? "local",
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    engine: {
      mode: engine.hasKey ? "live" : "simulated",
      model: engine.model,
      hasKey: engine.hasKey,
    },
    logLevel: process.env.HYPCHECK_LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
    db,
    writeProbe,
    counts,
    lastRun,
    lastAttempt,
  };

  return NextResponse.json(body, { status: db.ok ? 200 : 503 });
}
