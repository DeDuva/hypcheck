import type { Hypcheck, RefineResult, Run } from "../types";
import { currentVersion, latestRun, listMetrics, recordRun, setLastRunAttempt, setNextRun, type RunAttempt } from "../store";
import { engineInfo, liveEngineAvailable, liveRefine, liveRun } from "./claude";
import { simulateRun } from "./simulate";
import { Logger, logger, newRequestId, serializeError } from "../logger";

/** Persist the run-attempt marker; never let diagnostics break a run. */
async function safeSetAttempt(log: Logger, a: RunAttempt): Promise<void> {
  try {
    await setLastRunAttempt(a);
  } catch (err) {
    log.warn("engine.attempt.write_failed", { err: serializeError(err) });
  }
}

/** Execute a research run for a hypcheck and persist the result. */
export async function executeRun(hypcheck: Hypcheck, parentLog: Logger = logger): Promise<Run> {
  const log = parentLog.child({ runId: newRequestId(), hypcheckId: hypcheck.id });
  const model = engineInfo().model;
  const startedAt = new Date().toISOString();
  // Commit a "running" marker before the long work so a hard timeout (function
  // killed mid-run) is still visible on /api/health as a stuck "running" attempt.
  await safeSetAttempt(log, { status: "running", hypcheckId: hypcheck.id, hypcheckName: hypcheck.name, model, startedAt });

  try {
    return await runInner();
  } catch (err) {
    await safeSetAttempt(log, {
      status: "error",
      hypcheckId: hypcheck.id,
      hypcheckName: hypcheck.name,
      model,
      startedAt,
      finishedAt: new Date().toISOString(),
      error: serializeError(err),
    });
    throw err;
  }

  async function runInner(): Promise<Run> {
  return log.span(
    "engine.executeRun",
    async () => {
      // Independent reads run in parallel — on a high-latency (cross-region)
      // DB, serializing these alone can burn double-digit seconds.
      const [version, metrics, prior] = await Promise.all([
        currentVersion(hypcheck.id),
        listMetrics(hypcheck.id),
        latestRun(hypcheck.id),
      ]);
      const start = Date.now();

      let run: Run;
      let fellBack = false;
      if (liveEngineAvailable()) {
        const priorContext = prior
          ? `Previous run (${prior.runAt.slice(0, 10)}, hypothesis v${prior.hypothesisVersion}) scored ${prior.pmfScore}/100. Summary: ${prior.execSummary}`
          : null;
        try {
          // Report coarse progress into the attempt marker so a mid-run poll of
          // /api/health shows whether the (long) research call actually finished.
          const onPhase = (phase: string, extra: Record<string, unknown> = {}) =>
            safeSetAttempt(log, {
              status: "running",
              hypcheckId: hypcheck.id,
              hypcheckName: hypcheck.name,
              model,
              startedAt,
              phase,
              researchMs: typeof extra.researchMs === "number" ? extra.researchMs : undefined,
            });
          const { result, telemetry } = await liveRun(hypcheck, version, metrics, priorContext, log, onPhase);
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
      await safeSetAttempt(log, {
        status: "ok",
        hypcheckId: hypcheck.id,
        hypcheckName: hypcheck.name,
        model,
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - start,
        mode: run.mode,
        score: run.pmfScore,
        fellBack,
      });
      return run;
    },
    { hypcheckName: hypcheck.name, cadence: hypcheck.cadence, depth: hypcheck.depth, live: liveEngineAvailable() }
  );
  }
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
