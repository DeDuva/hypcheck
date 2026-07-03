import { NextResponse } from "next/server";
import { getDbStats } from "@/lib/store";
import { engineInfo } from "@/lib/engine";
import { logger, newRequestId, serializeError } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Debug/health snapshot. Hit this first when something looks wrong in a
 * deployment: it reports the deploy commit, engine mode/model, DB backend and
 * connectivity, row counts, and the latest run's telemetry (duration + tokens)
 * — which is exactly what you need to diagnose the recurring "runs time out"
 * failure mode. Exposes no secrets (only booleans and the model name).
 */
export async function GET() {
  const log = logger.child({ route: "health", reqId: newRequestId() });
  const engine = engineInfo();
  const backend = process.env.TURSO_DATABASE_URL ? "turso" : "file";

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

  const start = Date.now();
  try {
    const stats = await getDbStats();
    db = { backend, ok: true, latencyMs: Date.now() - start };
    counts = { hypchecks: stats.hypchecks, runs: stats.runs, insights: stats.insights };
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
      extractModel: engine.extractModel,
      hasKey: engine.hasKey,
    },
    logLevel: process.env.HYPCHECK_LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
    db,
    counts,
    lastRun,
  };

  return NextResponse.json(body, { status: db.ok ? 200 : 503 });
}
