"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { executeRun, refineHypothesis } from "./engine";
import {
  addVersion,
  createHypcheck,
  deleteHypcheck,
  getInsight,
  getUserByEmail,
  grantAccess,
  revokeAccess,
  setInsightStatus,
  setLastRunAttempt,
  updateHypcheckSettings,
  type CreateHypcheckInput,
} from "./store";
import { engineInfo } from "./engine";
import { requireCanCreateHypcheck, requireHypcheckAccess, requireUser } from "./authz";
import type { Cadence, Depth, GrantRole, RefineResult } from "./types";
import { logger, newRequestId, serializeError } from "./logger";

/** Every server action runs inside a correlated span so it's traceable in logs. */
function actionLogger(action: string, ctx: Record<string, unknown> = {}) {
  return logger.child({ action, reqId: newRequestId(), ...ctx });
}

export async function refineAction(statement: string): Promise<RefineResult & { mode: "live" | "heuristic" }> {
  const viewer = await requireUser();
  const log = actionLogger("refine", { userId: viewer.id, statementLen: statement.length });
  return log.span("action.refine", () => refineHypothesis(statement, log));
}

export async function createHypcheckAction(input: CreateHypcheckInput): Promise<void> {
  const viewer = await requireCanCreateHypcheck();
  const log = actionLogger("createHypcheck", { userId: viewer.id, name: input.name, metricCount: input.metrics.length });
  await log.span("action.createHypcheck", async () => {
    const hypcheck = await createHypcheck(input, viewer.id);
    log.info("hypcheck.created", { hypcheckId: hypcheck.id });
    // The first run (especially live research) can take well past a platform
    // request timeout, so don't block navigation on it — the overview page
    // triggers it client-side via runNowAction once the user lands there.
    revalidatePath("/", "layout");
    redirect(`/hypcheck/${hypcheck.id}`);
  });
}

/**
 * Kick off a research run WITHOUT blocking the request on it. The long Claude
 * research call runs in `after()` — after the response is sent — so the click
 * returns immediately and can never hit the request timeout. The client polls
 * /api/health (lastAttempt) until the run lands. Research still gets the full
 * background function budget.
 */
export async function runNowAction(hypcheckId: string): Promise<void> {
  const { viewer, hypcheck } = await requireHypcheckAccess(hypcheckId, "editor");
  const log = actionLogger("runNow", { userId: viewer.id, hypcheckId });

  // Mark it running now so the UI (and its poll) has immediate state.
  await setLastRunAttempt({
    status: "running",
    hypcheckId,
    hypcheckName: hypcheck.name,
    model: engineInfo().model,
    startedAt: new Date().toISOString(),
  });
  log.info("runNow.scheduled", { hypcheckName: hypcheck.name });

  after(async () => {
    try {
      await executeRun(hypcheck, log);
    } catch (err) {
      // executeRun already records an "error" attempt marker; this is a backstop.
      log.error("runNow.background.fail", { err: serializeError(err) });
    }
  });

  revalidatePath("/", "layout");
}

export async function acceptInsightAction(insightId: string): Promise<void> {
  const insight = await getInsight(insightId);
  const proposedRevision = insight?.proposedRevision;
  if (!insight || !proposedRevision) throw new Error("Insight has no proposed revision");
  const { viewer } = await requireHypcheckAccess(insight.hypcheckId, "editor");
  const log = actionLogger("acceptInsight", { userId: viewer.id, insightId });
  await log.span("action.acceptInsight", async () => {
    const version = await addVersion(
      insight.hypcheckId,
      proposedRevision,
      `Accepted insight: ${insight.title}`,
      "insight"
    );
    await setInsightStatus(insightId, "accepted");
    log.info("hypothesis.versioned", { hypcheckId: insight.hypcheckId, version: version.version, source: "insight" });
    revalidatePath("/", "layout");
  });
}

export async function dismissInsightAction(insightId: string): Promise<void> {
  const insight = await getInsight(insightId);
  if (!insight) throw new Error("Insight not found");
  const { viewer } = await requireHypcheckAccess(insight.hypcheckId, "editor");
  const log = actionLogger("dismissInsight", { userId: viewer.id, insightId });
  await log.span("action.dismissInsight", async () => {
    await setInsightStatus(insightId, "dismissed");
    revalidatePath("/", "layout");
  });
}

export async function reviseHypothesisAction(hypcheckId: string, formData: FormData): Promise<void> {
  const { viewer } = await requireHypcheckAccess(hypcheckId, "editor");
  const log = actionLogger("reviseHypothesis", { userId: viewer.id, hypcheckId });
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
  const { viewer } = await requireHypcheckAccess(hypcheckId, "editor");
  const log = actionLogger("updateSettings", { userId: viewer.id, hypcheckId });
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
  const { viewer } = await requireHypcheckAccess(hypcheckId, "owner");
  const log = actionLogger("deleteHypcheck", { userId: viewer.id, hypcheckId });
  await log.span("action.deleteHypcheck", async () => {
    await deleteHypcheck(hypcheckId);
    log.info("hypcheck.deleted", { hypcheckId });
    revalidatePath("/", "layout");
    redirect("/");
  });
}

/**
 * Share access to a hypcheck. Matrix: only an owner/admin may grant editor
 * access; an editor may only extend viewer access. UI for this lands in
 * phase 3 — for now it's callable directly (e.g. from a console or script).
 */
export async function grantHypcheckAccessAction(hypcheckId: string, formData: FormData): Promise<void> {
  const { viewer, role } = await requireHypcheckAccess(hypcheckId, "editor");
  const log = actionLogger("grantAccess", { userId: viewer.id, hypcheckId });
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const grantRole: GrantRole = String(formData.get("role") ?? "viewer") === "editor" ? "editor" : "viewer";
  if (grantRole === "editor" && role !== "admin" && role !== "owner") {
    throw new Error("Only the owner or an admin can grant editor access");
  }
  const target = await getUserByEmail(email);
  if (!target) throw new Error("No user with that email has signed in yet");
  await grantAccess(hypcheckId, target.id, grantRole, viewer.id);
  log.info("hypcheck.access.granted", { hypcheckId, targetUserId: target.id, role: grantRole });
  revalidatePath(`/hypcheck/${hypcheckId}/settings`);
}

export async function revokeHypcheckAccessAction(hypcheckId: string, userId: string): Promise<void> {
  const { viewer } = await requireHypcheckAccess(hypcheckId, "editor");
  const log = actionLogger("revokeAccess", { userId: viewer.id, hypcheckId });
  await revokeAccess(hypcheckId, userId);
  log.info("hypcheck.access.revoked", { hypcheckId, targetUserId: userId });
  revalidatePath(`/hypcheck/${hypcheckId}/settings`);
}
