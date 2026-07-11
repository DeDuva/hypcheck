import type { Hypcheck, PriorRunDigest, RefineAnswer, RefineResult, Run } from "../types";
import { currentVersion, latestRun, linkTraceToRun, listInsights, listMetrics, recordRun, setLastRunAttempt, setNextRun, type RunAttempt } from "../store";
import { engineInfo, liveEngineAvailable, liveRefine, liveRun } from "./claude";
import { simulateRun } from "./simulate";
import { Logger, logger, newRequestId, serializeError } from "../logger";
import { FALLBACK_LATEST } from "../models";

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
  // Display-only marker value; the run's trace records the exact resolved model ID.
  const model = process.env.HYPCHECK_MODEL || FALLBACK_LATEST[hypcheck.model];
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
      const [version, metrics, prior, openInsights] = await Promise.all([
        currentVersion(hypcheck.id),
        listMetrics(hypcheck.id),
        latestRun(hypcheck.id),
        listInsights(hypcheck.id, "new"),
      ]);
      const start = Date.now();

      let run: Run;
      let fellBack = false;
      if (liveEngineAvailable()) {
        // Structured digest of the previous run so the engine scores against
        // it (consistency + carry-forward) and reports what changed.
        const priorDigest: PriorRunDigest | null = prior
          ? {
              runAt: prior.runAt,
              hypothesisVersion: prior.hypothesisVersion,
              pmfScore: prior.pmfScore,
              stance: prior.industryAnalysis?.stance ?? null,
              metricScores: prior.metricScores,
              openInsightTitles: openInsights.map((i) => i.title).slice(0, 5),
            }
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
          const { result, telemetry, runAt, traceId } = await liveRun(hypcheck, version, metrics, priorDigest, log, onPhase);
          // Persist the same instant the report was rendered against, so the
          // report body's date can never drift from the run's `runAt`.
          run = await recordRun(hypcheck.id, version, "live", result, runAt, {
            durationMs: Date.now() - start,
            ...telemetry,
          });
          if (traceId) {
            try {
              await linkTraceToRun(traceId, run.id);
            } catch (err) {
              log.warn("trace.link_failed", { err: serializeError(err) });
            }
          }
        } catch (err) {
          // Fall back to the simulated engine so a transient API failure doesn't
          // leave a scheduled run silently missing from the timeline.
          fellBack = true;
          log.warn("engine.live.fallback", { err: serializeError(err) });
          const runAt = new Date();
          const result = simulateRun(hypcheck, version, metrics, runAt, prior?.pmfScore ?? null);
          run = await recordRun(hypcheck.id, version, "simulated", result, runAt, {
            durationMs: Date.now() - start,
          });
        }
      } else {
        const runAt = new Date();
        const result = simulateRun(hypcheck, version, metrics, runAt, prior?.pmfScore ?? null);
        run = await recordRun(hypcheck.id, version, "simulated", result, runAt, {
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
  const hasTime = /\b(within|by (q[1-4]|20\d\d)|in \d+ (weeks?|months?|quarters?)|per (week|month))\b/i.test(trimmed);
  const hasCompetitor = /\b(unlike|vs\.?|versus|instead of|compared to|incumbent)\b/i.test(trimmed) || /[A-Z][a-z]+[A-Z]/.test(trimmed);

  const gaps: string[] = [];
  if (!hasUser) gaps.push("it does not name a specific target user or segment");
  if (!hasProblem) gaps.push("the underlying pain point is implied rather than stated");
  if (!hasMoney) gaps.push("it makes no claim about willingness to pay");

  const rubric = [
    { criterion: "Named target segment", pass: hasUser, fix: hasUser ? null : "Name the specific user segment that has this problem." },
    { criterion: "Falsifiable claim", pass: hasProblem && hasMoney, fix: hasProblem && hasMoney ? null : "State a claim evidence could disprove — who pays, for what, and why." },
    { criterion: "Externally observable evidence", pass: hasMoney, fix: hasMoney ? null : "Tie the claim to signals visible on the public web (pricing, launches, hiring, search volume)." },
    { criterion: "Time-bound / testable", pass: hasTime, fix: hasTime ? null : "Anchor the claim to a horizon so weekly runs can adjudicate it." },
    { criterion: "Differentiated vs named incumbents", pass: hasCompetitor, fix: hasCompetitor ? null : "Say what incumbents miss — name the closest one." },
  ];

  const critique = gaps.length
    ? `The hypothesis is a reasonable starting point, but ${gaps.join("; ")}. A strong PMF hypothesis names who has the problem, what evidence would prove they care, and what they would give up (money, time, an incumbent tool) to solve it. Tightening these makes the hypothesis falsifiable — which is what lets a tracker like this actually move your conviction over time.`
    : `The hypothesis already names a user, a pain point, and a value exchange — a solid, falsifiable shape. The refinement below sharpens the wording so each clause maps cleanly to a trackable signal.`;

  const refinedStatement = gaps.length
    ? `${trimmed.replace(/\.$/, "")} — specifically for a named early segment with an acute, budgeted version of this problem, who currently rely on a workaround they complain about, and who would pay for a tool that removes it.`
    : trimmed;

  return {
    critique,
    refinedStatement,
    rubric,
    clarifyingQuestions: [],
    suggestedMetrics: [
      {
        name: "Demand signal",
        description: "Search volume, community discussion, and inbound interest indicating the target user actively feels this problem.",
        weight: 5,
        signals: "Search-trend movement, new community threads and upvotes on the pain point, practitioner posts describing the workaround.",
        direction: "Up: rising search/community volume on the problem. Down: discussion fades or shifts to 'solved by' an incumbent.",
      },
      {
        name: "Willingness to pay",
        description: "Evidence of budget: pricing of adjacent tools, procurement chatter, hiring for the workflow.",
        weight: 4,
        signals: "Pricing-page changes at adjacent tools, funding rounds in the category, job postings that own this workflow.",
        direction: "Up: adjacent tools raise prices or new paid entrants appear. Down: category tools go freemium or get bundled free.",
      },
      {
        name: "Competitive whitespace",
        description: "How directly incumbents and new entrants cover this exact job-to-be-done.",
        weight: 4,
        signals: "Launch posts, changelogs, and feature announcements from incumbents and new entrants targeting the same job.",
        direction: "Up: the specific job stays unserved. Down: a credible player ships direct coverage of it.",
      },
      {
        name: "Adoption friction",
        description: "Switching costs, integration burden, and behavior change required for the target user to adopt.",
        weight: 3,
        signals: "New integrations/APIs in the ecosystem, platform policy changes, public complaints about switching costs.",
        direction: "Up: ecosystem changes lower the barrier to adopt. Down: platform lock-in or new compliance hurdles raise it.",
      },
      {
        name: "Market timing",
        description: "Category momentum — is this problem growing, stable, or being absorbed by platforms?",
        weight: 3,
        signals: "Analyst coverage, category funding totals, conference agendas, platform-vendor roadmap announcements.",
        direction: "Up: category coverage and funding accelerate. Down: platforms absorb the category or attention moves on.",
      },
    ],
    rejectedMetrics: [],
    suggestedWatchlist: [],
  };
}

export async function refineHypothesis(
  statement: string,
  answers: RefineAnswer[] = [],
  parentLog: Logger = logger
): Promise<RefineResult & { mode: "live" | "heuristic" }> {
  const log = parentLog.child({ op: "refine" });
  if (liveEngineAvailable()) {
    try {
      const result = await liveRefine(statement, answers, log);
      return { ...result, mode: "live" };
    } catch (err) {
      log.warn("engine.refine.fallback", { err: serializeError(err) });
    }
  }
  return { ...heuristicRefine(statement), mode: "heuristic" };
}

/** Re-exported so server routes/actions can report engine config without importing claude.ts. */
export { engineInfo };
