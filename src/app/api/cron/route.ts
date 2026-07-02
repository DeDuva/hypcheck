import { NextResponse } from "next/server";
import { listDueHypchecks } from "@/lib/store";
import { executeRun } from "@/lib/engine";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";
// Live research runs can take several minutes at deep settings.
export const maxDuration = 300;

/**
 * Scheduled-run endpoint. Vercel Cron hits this on the schedule in vercel.json
 * with "Authorization: Bearer $CRON_SECRET"; each due hypcheck gets a research run.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  await ensureSeeded();
  const due = await listDueHypchecks();
  const results: Array<{ id: string; name: string; ok: boolean; score?: number; error?: string }> = [];

  for (const hypcheck of due) {
    try {
      const run = await executeRun(hypcheck);
      results.push({ id: hypcheck.id, name: hypcheck.name, ok: true, score: run.pmfScore });
    } catch (err) {
      results.push({ id: hypcheck.id, name: hypcheck.name, ok: false, error: String(err) });
    }
  }

  return NextResponse.json({ ran: results.length, results });
}
