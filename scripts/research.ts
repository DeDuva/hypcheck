/**
 * Research-job entry point, run by .github/workflows/research.yml:
 *
 *   HYPCHECK_ID=<id> npx tsx scripts/research.ts   # one hypcheck ("Run now")
 *   npx tsx scripts/research.ts                    # every due hypcheck (cron)
 *
 * Needs TURSO_DATABASE_URL + TURSO_AUTH_TOKEN (the production DB) and
 * ANTHROPIC_API_KEY (live research). Locally, `--local` allows the file DB:
 *   npx tsx --env-file=.env.local scripts/research.ts --local
 *
 * Exit code is non-zero if any hypcheck's run threw, so a failure turns the
 * Actions run red. A live call that fell back to the simulated engine is a
 * warning annotation, not a failure — that matches how the app treats it.
 */
import fs from "node:fs";
import { parseHypcheckId, runResearchJob, type JobResult } from "../src/lib/researchJob";

function summary(results: JobResult[]): string {
  const rows = results.map(
    (r) => `| \`${r.id}\` | ${r.name.replace(/\|/g, "\\|")} | ${r.ok ? "ok" : "failed"} | ${r.mode ?? "—"} | ${r.score ?? "—"} |`
  );
  return [
    "### Research runs",
    "",
    results.length ? "| id | hypcheck | result | mode | PMF |\n|---|---|---|---|---|\n" + rows.join("\n") : "Nothing was due.",
    "",
  ].join("\n");
}

async function main() {
  const local = process.argv.includes("--local");
  if (!local && !process.env.TURSO_DATABASE_URL) {
    // Without it db.ts silently uses a fresh file DB on the runner, and the
    // "run" would land nowhere the app can see.
    console.error("TURSO_DATABASE_URL is not set (pass --local to use the local file DB).");
    process.exit(2);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("::warning::ANTHROPIC_API_KEY is not set — runs will use the simulated engine.");
  }

  const hypcheckId = parseHypcheckId(process.env.HYPCHECK_ID);
  const results = await runResearchJob(hypcheckId);

  for (const r of results) {
    if (r.ok && r.mode === "simulated" && process.env.ANTHROPIC_API_KEY) {
      console.log(`::warning::${r.id} fell back to the simulated engine — the live call failed; see the logs above.`);
    }
  }
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary(results));
  console.log(JSON.stringify({ ran: results.length, results }));
  // Exit explicitly: an open DB client handle must not keep the job alive.
  process.exit(results.some((r) => !r.ok) ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
