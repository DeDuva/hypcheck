import { NextResponse } from "next/server";
import { listDueHypchecks, setLastRunAttempt } from "@/lib/store";
import { dispatchResearch } from "@/lib/dispatch";
import { ensureSeeded } from "@/lib/seed";
import { FALLBACK_LATEST } from "@/lib/models";
import { logger, newRequestId, serializeError } from "@/lib/logger";

export const dynamic = "force-dynamic";
// This route only dispatches research to GitHub Actions (src/lib/dispatch.ts);
// it never runs it, so it fits well inside Vercel Hobby's 300 s ceiling.
export const maxDuration = 60;

/**
 * Scheduled-run endpoint. Vercel Cron hits this on the schedule in vercel.json
 * with "Authorization: Bearer $CRON_SECRET". Each due hypcheck is marked
 * queued and gets its own `research.yml` workflow run.
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

  return log.span("cron.dispatch", async () => {
    await ensureSeeded();
    const due = await listDueHypchecks();
    log.info("cron.due", { count: due.length });

    const results: Array<{ id: string; name: string; dispatched: boolean; error?: string }> = [];
    for (const hypcheck of due) {
      const attempt = {
        hypcheckId: hypcheck.id,
        hypcheckName: hypcheck.name,
        model: process.env.HYPCHECK_MODEL || FALLBACK_LATEST[hypcheck.model],
        startedAt: new Date().toISOString(),
      };
      try {
        await setLastRunAttempt({ status: "queued", ...attempt });
        await dispatchResearch(hypcheck.id);
        results.push({ id: hypcheck.id, name: hypcheck.name, dispatched: true });
      } catch (err) {
        log.error("cron.dispatch.fail", { hypcheckId: hypcheck.id, err: serializeError(err) });
        await setLastRunAttempt({
          status: "error",
          ...attempt,
          finishedAt: new Date().toISOString(),
          error: serializeError(err),
        }).catch(() => {});
        results.push({ id: hypcheck.id, name: hypcheck.name, dispatched: false, error: String(err) });
      }
    }

    const dispatched = results.filter((r) => r.dispatched).length;
    log.info("cron.done", { due: results.length, dispatched, failed: results.length - dispatched });
    // Non-2xx when any dispatch failed, so it shows up red in Vercel's cron log.
    return NextResponse.json({ due: results.length, dispatched, results }, { status: dispatched === results.length ? 200 : 502 });
  });
}
