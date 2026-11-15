/**
 * The body of a research job, run by `scripts/research.ts` inside the
 * `research.yml` GitHub Actions workflow (never on Vercel — see dispatch.ts).
 * Plain Node: imports nothing from Next.
 */
import { executeRun } from "./engine";
import { getHypcheck, listDueHypchecks } from "./store";
import { logger as rootLogger, serializeError, type Logger } from "./logger";
import type { Hypcheck } from "./types";

export interface JobResult {
  id: string;
  name: string;
  ok: boolean;
  mode?: string;
  score?: number;
  error?: string;
}

/** Hypcheck ids are short hex (db.ts newId); allow a little more, never shell or SQL metacharacters. */
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function parseHypcheckId(raw: string | undefined | null): string | null {
  const id = (raw ?? "").trim();
  if (!id) return null;
  if (!ID_RE.test(id)) throw new Error(`Invalid hypcheck id: ${JSON.stringify(id.slice(0, 80))}`);
  return id;
}

/**
 * Run research for one hypcheck (when `hypcheckId` is given, regardless of
 * whether it's due — that's "Run now"), or for every due hypcheck.
 */
export async function runResearchJob(
  hypcheckId: string | null,
  log: Logger = rootLogger.child({ job: "research" })
): Promise<JobResult[]> {
  let targets: Hypcheck[];
  if (hypcheckId) {
    const h = await getHypcheck(hypcheckId);
    if (!h) throw new Error(`No hypcheck with id ${hypcheckId}`);
    targets = [h];
  } else {
    targets = await listDueHypchecks();
  }
  log.info("research.job.start", { requested: hypcheckId ?? "(all due)", count: targets.length });

  const results: JobResult[] = [];
  for (const h of targets) {
    try {
      const run = await executeRun(h, log);
      results.push({ id: h.id, name: h.name, ok: true, mode: run.mode, score: run.pmfScore });
    } catch (err) {
      // executeRun has already written an "error" attempt marker for the UI.
      log.error("research.job.hypcheck.fail", { hypcheckId: h.id, err: serializeError(err) });
      results.push({ id: h.id, name: h.name, ok: false, error: String(err) });
    }
  }
  log.info("research.job.done", { ran: results.length, ok: results.filter((r) => r.ok).length });
  return results;
}
