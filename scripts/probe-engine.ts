/**
 * Standalone probe for the live research engine — exercises liveRun() end to end
 * against a stubbed hypcheck, without the app, DB, or UI.
 *
 * Run with the key from .env.local:
 *   node --env-file=.env.local node_modules/.bin/tsx scripts/probe-engine.ts
 * or:
 *   npx tsx --env-file=.env.local scripts/probe-engine.ts
 *
 * Prints the run telemetry (one model call now, so a single input/output token
 * pair + search count) and the rendered markdown report. Exits non-zero if the
 * engine has no API key or the call fails — this is the fast way to confirm the
 * single-pass web_search + json_schema composition actually works.
 */
import type { Hypcheck, HypothesisVersion, Metric } from "../src/lib/types";
import { liveEngineAvailable, liveRun } from "../src/lib/engine/claude";
import { logger } from "../src/lib/logger";

async function main() {
  if (!liveEngineAvailable()) {
    console.error("No ANTHROPIC_API_KEY — pass --env-file=.env.local (or export the key).");
    process.exit(1);
  }

  const hypcheck: Hypcheck = {
    id: "probe",
    name: "AI notetakers for solo consultants",
    status: "active",
    cadence: "weekly",
    depth: "brief", // brief = at most 3 searches, keeps the probe fast/cheap
    watchlist: ["Otter.ai", "Fathom", "Granola"],
    createdAt: new Date().toISOString(),
    nextRunAt: null,
    ownerId: null,
  };

  const version: HypothesisVersion = {
    id: "probe-v1",
    hypcheckId: "probe",
    version: 1,
    statement:
      "Solo management consultants will pay $30+/mo for an AI notetaker that turns client calls into structured, branded deliverables (not just transcripts).",
    changeSummary: null,
    source: "initial",
    createdAt: new Date().toISOString(),
  };

  const metrics: Metric[] = [
    { id: "m1", hypcheckId: "probe", name: "Demand signal", description: "Search volume and community discussion indicating solo consultants actively feel this problem.", weight: 5 },
    { id: "m2", hypcheckId: "probe", name: "Willingness to pay", description: "Evidence of budget at the $30+/mo tier for adjacent tools.", weight: 4 },
    { id: "m3", hypcheckId: "probe", name: "Competitive whitespace", description: "How directly incumbents cover 'call -> branded deliverable' vs. plain transcription.", weight: 4 },
  ];

  const t0 = Date.now();
  const { result, telemetry } = await liveRun(hypcheck, version, metrics, null, logger, (phase, extra) =>
    console.error(`[phase] ${phase}`, extra ?? {})
  );
  const wallMs = Date.now() - t0;

  console.error("\n=== TELEMETRY ===");
  console.error({ wallMs, ...telemetry });
  console.error("=== HEADLINE ===");
  console.error({ pmfScore: result.pmfScore, confidence: result.confidence, stance: result.industryAnalysis.stance });
  console.error("=== METRIC NAMES MATCHED ===");
  console.error(result.metricScores.map((m) => ({ name: m.name, id: m.metricId || "(UNMATCHED)", score: m.score })));
  console.error("\n=== REPORT MARKDOWN ===\n");
  console.log(result.reportMd);
}

main().catch((err) => {
  console.error("PROBE FAILED:", err);
  process.exit(1);
});
