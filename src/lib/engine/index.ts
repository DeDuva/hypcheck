import type { Hypcheck, RefineResult, Run } from "../types";
import { currentVersion, latestRun, listMetrics, recordRun, setNextRun } from "../store";
import { engineInfo, liveEngineAvailable, liveRefine, liveRun } from "./claude";
import { simulateRun } from "./simulate";
import { Logger, logger, newRequestId, serializeError } from "../logger";

/** Execute a research run for a hypcheck and persist the result. */
export async function executeRun(hypcheck: Hypcheck, parentLog: Logger = logger): Promise<Run> {
  const log = parentLog.child({ runId: newRequestId(), hypcheckId: hypcheck.id });
  return log.span(
    "engine.executeRun",
    async () => {
      const version = await currentVersion(hypcheck.id);
      const metrics = await listMetrics(hypcheck.id);
      const prior = await latestRun(hypcheck.id);
      const start = Date.now();

      let run: Run;
      let fellBack = false;
      if (liveEngineAvailable()) {
        const priorContext = prior
          ? `Previous run (${prior.runAt.slice(0, 10)}, hypothesis v${prior.hypothesisVersion}) scored ${prior.pmfScore}/100. Summary: ${prior.execSummary}`
          : null;
        try {
          const { result, telemetry } = await liveRun(hypcheck, version, metrics, priorContext, log);
          run = await recordRun(hypcheck.id, version, "live", result, new Date(), {
            durationMs: Date.now() - start,
            ...telemetry,
          });
        } catch (err) {
          // Fall back to the simulated engine so a transient API failure doesn't
          // leave a scheduled run silently missing from the timeline.
          fellBack = true;
          log.warn("engine.live.fallback", { err: serializeError(err) });
          const result = simulateRun(hypcheck, version, metrics, new Date(), prior?.pmfScore ?? null);
          run = await recordRun(hypcheck.id, version, "simulated", result, new Date(), {
            durationMs: Date.now() - start,
          });
        }
      } else {
        const result = simulateRun(hypcheck, version, metrics, new Date(), prior?.pmfScore ?? null);
        run = await recordRun(hypcheck.id, version, "simulated", result, new Date(), {
          durationMs: Date.now() - start,
        });
      }

      await setNextRun(hypcheck.id, hypcheck.cadence);
      log.info("engine.run.recorded", {
        recordedRunId: run.id,
        mode: run.mode,
        score: run.pmfScore,
        version: run.hypothesisVersion,
        fellBack,
        ms: Date.now() - start,
      });
      return run;
    },
    { hypcheckName: hypcheck.name, cadence: hypcheck.cadence, depth: hypcheck.depth, live: liveEngineAvailable() }
  );
}

// ---------------------------------------------------------------------------
// Hypothesis refinement
// ---------------------------------------------------------------------------

function heuristicRefine(statement: string): RefineResult {
  const trimmed = statement.trim().replace(/\s+/g, " ");
  const hasUser = /\b(for|targeting|aimed at|used by)\b/i.test(trimmed);
  const hasProblem = /\b(because|struggle|pain|problem|waste|lack|fail|slow|cost)\b/i.test(trimmed);
  const hasMoney = /\b(pay|price|budget|spend|\$|subscription|per seat|willing)\b/i.test(trimmed);

  const gaps: string[] = [];
  if (!hasUser) gaps.push("it does not name a specific target user or segment");
  if (!hasProblem) gaps.push("the underlying pain point is implied rather than stated");
  if (!hasMoney) gaps.push("it makes no claim about willingness to pay");

  const critique = gaps.length
    ? `The hypothesis is a reasonable starting point, but ${gaps.join("; ")}. A strong PMF hypothesis names who has the problem, what evidence would prove they care, and what they would give up (money, time, an incumbent tool) to solve it. Tightening these makes the hypothesis falsifiable — which is what lets a tracker like this actually move your conviction over time.`
    : `The hypothesis already names a user, a pain point, and a value exchange — a solid, falsifiable shape. The refinement below sharpens the wording so each clause maps cleanly to a trackable signal.`;

  const refinedStatement = gaps.length
    ? `${trimmed.replace(/\.$/, "")} — specifically for a named early segment with an acute, budgeted version of this problem, who currently rely on a workaround they complain about, and who would pay for a tool that removes it.`
    : trimmed;

  return {
    critique,
    refinedStatement,
    suggestedMetrics: [
      { name: "Demand signal", description: "Search volume, community discussion, and inbound interest indicating the target user actively feels this problem.", weight: 5 },
      { name: "Willingness to pay", description: "Evidence of budget: pricing of adjacent tools, procurement chatter, hiring for the workflow.", weight: 4 },
      { name: "Competitive whitespace", description: "How directly incumbents and new entrants cover this exact job-to-be-done.", weight: 4 },
      { name: "Adoption friction", description: "Switching costs, integration burden, and behavior change required for the target user to adopt.", weight: 3 },
      { name: "Market timing", description: "Category momentum — is this problem growing, stable, or being absorbed by platforms?", weight: 3 },
    ],
    suggestedWatchlist: [],
  };
}

export async function refineHypothesis(
  statement: string,
  parentLog: Logger = logger
): Promise<RefineResult & { mode: "live" | "heuristic" }> {
  const log = parentLog.child({ op: "refine" });
  if (liveEngineAvailable()) {
    try {
      const result = await liveRefine(statement, log);
      return { ...result, mode: "live" };
    } catch (err) {
      log.warn("engine.refine.fallback", { err: serializeError(err) });
    }
  }
  return { ...heuristicRefine(statement), mode: "heuristic" };
}

/** Re-exported so server routes/actions can report engine config without importing claude.ts. */
export { engineInfo };
