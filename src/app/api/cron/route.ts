import { NextResponse } from "next/server";
import { listDueHypchecks } from "@/lib/store";
import { executeRun } from "@/lib/engine";
import { ensureSeeded } from "@/lib/seed";
import { logger, newRequestId, serializeError } from "@/lib/logger";

export const dynamic = "force-dynamic";
// Live research runs can take several minutes at deep settings.
export const maxDuration = 300;

/**
 * Scheduled-run endpoint. Vercel Cron hits this on the schedule in vercel.json
 * with "Authorization: Bearer $CRON_SECRET"; each due hypcheck gets a research run.
 */
export async function GET(request: Request) {
  const log = logger.child({ route: "cron", reqId: newRequestId() });
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      log.warn("cron.unauthorized");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  return log.span("cron.run", async () => {
    await ensureSeeded();
    const due = await listDueHypchecks();
    log.info("cron.due", { count: due.length });

    const results: Array<{ id: string; name: string; ok: boolean; score?: number; mode?: string; error?: string }> = [];
    for (const hypcheck of due) {
      try {
        const run = await executeRun(hypcheck, log);
        results.push({ id: hypcheck.id, name: hypcheck.name, ok: true, score: run.pmfScore, mode: run.mode });
      } catch (err) {
        log.error("cron.hypcheck.fail", { hypcheckId: hypcheck.id, err: serializeError(err) });
        results.push({ id: hypcheck.id, name: hypcheck.name, ok: false, error: String(err) });
      }
    }

    const ok = results.filter((r) => r.ok).length;
    log.info("cron.done", { ran: results.length, ok, failed: results.length - ok });
    return NextResponse.json({ ran: results.length, ok, results });
  });
}
