"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { executeRun, refineHypothesis } from "./engine";
import {
  addVersion,
  createHypcheck,
  deleteHypcheck,
  getHypcheck,
  getInsight,
  setInsightStatus,
  setLastRunAttempt,
  updateHypcheckSettings,
  type CreateHypcheckInput,
} from "./store";
import { engineInfo } from "./engine";
import type { Cadence, Depth, RefineResult } from "./types";
import { logger, newRequestId } from "./logger";

/** Every server action runs inside a correlated span so it's traceable in logs. */
function actionLogger(action: string, ctx: Record<string, unknown> = {}) {
  return logger.child({ action, reqId: newRequestId(), ...ctx });
}

export async function refineAction(statement: string): Promise<RefineResult & { mode: "live" | "heuristic" }> {
  const log = actionLogger("refine", { statementLen: statement.length });
  return log.span("action.refine", () => refineHypothesis(statement, log));
}

export async function createHypcheckAction(input: CreateHypcheckInput): Promise<void> {
  const log = actionLogger("createHypcheck", { name: input.name, metricCount: input.metrics.length });
  await log.span("action.createHypcheck", async () => {
    const hypcheck = await createHypcheck(input);
    log.info("hypcheck.created", { hypcheckId: hypcheck.id });
    // The first run (especially live research) can take well past a platform
    // request timeout, so don't block navigation on it — the overview page
    // triggers it client-side via runNowAction once the user lands there.
    revalidatePath("/", "layout");
    redirect(`/hypcheck/${hypcheck.id}`);
  });
}

export async function runNowAction(hypcheckId: string): Promise<void> {
  const log = actionLogger("runNow", { hypcheckId });
  await log.span("action.runNow", async () => {
    // Earliest possible marker — if this never lands, the function died before
    // our code even reached the DB (cold-start / init). executeRun overwrites
    // it with the real hypcheck name once the read succeeds.
    try {
      await setLastRunAttempt({
        status: "running",
        hypcheckId,
        hypcheckName: "(loading)",
        model: engineInfo().model,
        startedAt: new Date().toISOString(),
      });
    } catch (err) {
      log.warn("action.runNow.marker_failed", { err: String(err) });
    }
    const hypcheck = await getHypcheck(hypcheckId);
    if (!hypcheck) throw new Error("Hypcheck not found");
    await executeRun(hypcheck, log);
    revalidatePath("/", "layout");
  });
}

export async function acceptInsightAction(insightId: string): Promise<void> {
  const log = actionLogger("acceptInsight", { insightId });
  await log.span("action.acceptInsight", async () => {
    const insight = await getInsight(insightId);
    if (!insight?.proposedRevision) throw new Error("Insight has no proposed revision");
    const version = await addVersion(
      insight.hypcheckId,
      insight.proposedRevision,
      `Accepted insight: ${insight.title}`,
      "insight"
    );
    await setInsightStatus(insightId, "accepted");
    log.info("hypothesis.versioned", { hypcheckId: insight.hypcheckId, version: version.version, source: "insight" });
    revalidatePath("/", "layout");
  });
}

export async function dismissInsightAction(insightId: string): Promise<void> {
  const log = actionLogger("dismissInsight", { insightId });
  await log.span("action.dismissInsight", async () => {
    await setInsightStatus(insightId, "dismissed");
    revalidatePath("/", "layout");
  });
}

export async function reviseHypothesisAction(hypcheckId: string, formData: FormData): Promise<void> {
  const log = actionLogger("reviseHypothesis", { hypcheckId });
  await log.span("action.reviseHypothesis", async () => {
    const statement = String(formData.get("statement") ?? "").trim();
    const changeSummary = String(formData.get("changeSummary") ?? "").trim();
    if (!statement) throw new Error("Statement required");
    const version = await addVersion(hypcheckId, statement, changeSummary || "Manual revision", "manual");
    log.info("hypothesis.versioned", { hypcheckId, version: version.version, source: "manual" });
    revalidatePath("/", "layout");
  });
}

export async function updateSettingsAction(hypcheckId: string, formData: FormData): Promise<void> {
  const log = actionLogger("updateSettings", { hypcheckId });
  await log.span("action.updateSettings", async () => {
    const watchlistRaw = String(formData.get("watchlist") ?? "");
    await updateHypcheckSettings(hypcheckId, {
      name: String(formData.get("name") ?? "").trim() || undefined,
      cadence: (formData.get("cadence") as Cadence) || undefined,
      depth: (formData.get("depth") as Depth) || undefined,
      status: (formData.get("status") as "active" | "paused") || undefined,
      watchlist: watchlistRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    });
    revalidatePath("/", "layout");
    redirect(`/hypcheck/${hypcheckId}`);
  });
}

export async function deleteHypcheckAction(hypcheckId: string): Promise<void> {
  const log = actionLogger("deleteHypcheck", { hypcheckId });
  await log.span("action.deleteHypcheck", async () => {
    await deleteHypcheck(hypcheckId);
    log.info("hypcheck.deleted", { hypcheckId });
    revalidatePath("/", "layout");
    redirect("/");
  });
}
