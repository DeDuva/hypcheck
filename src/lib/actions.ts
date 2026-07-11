"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { executeRun, refineHypothesis } from "./engine";
import {
  addAllowedEmail,
  addVersion,
  applyWatchlistChange,
  createHypcheck,
  createInvitation,
  deleteHypcheck,
  getAccessGrant,
  getInsight,
  getUserByEmail,
  grantAccess,
  removeAllowedEmail,
  revokeAccess,
  revokeInvitation,
  setInsightStatus,
  setLastRunAttempt,
  updateHypcheckSettings,
  updateModelAccess,
  updateUserRole,
  type CreateHypcheckInput,
} from "./store";
import { FALLBACK_LATEST } from "./models";
import { allowedModelFamilies, requireAdmin, requireCanCreateHypcheck, requireHypcheckAccess, requireUser } from "./authz";
import type { Cadence, Depth, GlobalRole, GrantRole, ModelFamily, RefineAnswer, RefineResult, WatchlistEntry } from "./types";
import { GRANTABLE_MODEL_FAMILIES, MODEL_FAMILIES } from "./types";
import { logger, newRequestId, serializeError } from "./logger";

/** Every server action runs inside a correlated span so it's traceable in logs. */
function actionLogger(action: string, ctx: Record<string, unknown> = {}) {
  return logger.child({ action, reqId: newRequestId(), ...ctx });
}

export async function refineAction(
  statement: string,
  answers: RefineAnswer[] = []
): Promise<RefineResult & { mode: "live" | "heuristic" }> {
  const viewer = await requireUser();
  const log = actionLogger("refine", { userId: viewer.id, statementLen: statement.length, answered: answers.length });
  return log.span("action.refine", () => refineHypothesis(statement, answers, log));
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
    model: process.env.HYPCHECK_MODEL || FALLBACK_LATEST[hypcheck.model],
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
  if (!insight || (!insight.proposedRevision && !insight.proposedWatchlistChange)) {
    throw new Error("Insight has no proposal to accept");
  }
  const { viewer } = await requireHypcheckAccess(insight.hypcheckId, "editor");
  const log = actionLogger("acceptInsight", { userId: viewer.id, insightId });
  await log.span("action.acceptInsight", async () => {
    if (insight.proposedRevision) {
      const version = await addVersion(
        insight.hypcheckId,
        insight.proposedRevision,
        `Accepted insight: ${insight.title}`,
        "insight"
      );
      log.info("hypothesis.versioned", { hypcheckId: insight.hypcheckId, version: version.version, source: "insight" });
    } else if (insight.proposedWatchlistChange) {
      await applyWatchlistChange(insight.hypcheckId, insight.proposedWatchlistChange);
      log.info("watchlist.changed", { hypcheckId: insight.hypcheckId, ...insight.proposedWatchlistChange });
    }
    await setInsightStatus(insightId, "accepted");
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
  const { viewer, hypcheck } = await requireHypcheckAccess(hypcheckId, "editor");
  const log = actionLogger("updateSettings", { userId: viewer.id, hypcheckId });
  await log.span("action.updateSettings", async () => {
    // The watchlist editor serializes its full name+reason+category state into
    // this hidden field, so reasons round-trip instead of being reconstructed
    // by matching names against what was previously stored.
    let raw: Array<{ name?: string; reason?: string; category?: WatchlistEntry["category"] }> = [];
    try {
      raw = JSON.parse(String(formData.get("watchlistJson") ?? "[]"));
    } catch {
      raw = [];
    }
    const seen = new Set<string>();
    const watchlist: WatchlistEntry[] = raw
      .map((e) => ({ name: (e.name ?? "").trim(), reason: (e.reason ?? "").trim(), category: e.category }))
      .filter((e) => {
        if (!e.name || seen.has(e.name.toLowerCase())) return false;
        seen.add(e.name.toLowerCase());
        return true;
      });
    // Model changes are permission-gated server-side: the chosen family must
    // be one the editor is allowed to use, or the hypcheck's current value
    // (so saving unrelated settings never fails on a model someone else set).
    const requestedModel = formData.get("model") as ModelFamily | null;
    let model: ModelFamily | undefined;
    if (requestedModel && MODEL_FAMILIES.includes(requestedModel) && requestedModel !== hypcheck.model) {
      const allowed = await allowedModelFamilies(viewer);
      if (!allowed.includes(requestedModel)) {
        log.warn("settings.model.denied", { requestedModel });
        throw new Error(`You don't have access to the ${requestedModel} model — ask an admin to enable it`);
      }
      model = requestedModel;
    }

    await updateHypcheckSettings(hypcheckId, {
      name: String(formData.get("name") ?? "").trim() || undefined,
      cadence: (formData.get("cadence") as Cadence) || undefined,
      depth: (formData.get("depth") as Depth) || undefined,
      model,
      status: (formData.get("status") as "active" | "paused") || undefined,
      watchlist,
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
 * access; an editor may only extend viewer access. Failures redirect back to
 * the settings page with `?shareError=` instead of throwing, since this runs
 * as a plain form action with no client-side error boundary. If the email
 * hasn't signed in yet, this creates a pending invitation instead — it's
 * activated into a real grant on that email's first login (see auth.ts).
 */
export async function grantHypcheckAccessAction(hypcheckId: string, formData: FormData): Promise<void> {
  const { viewer, role } = await requireHypcheckAccess(hypcheckId, "editor");
  const log = actionLogger("grantAccess", { userId: viewer.id, hypcheckId });
  const settingsPath = `/hypcheck/${hypcheckId}/settings`;
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const grantRole: GrantRole = String(formData.get("role") ?? "viewer") === "editor" ? "editor" : "viewer";

  if (!email) redirect(`${settingsPath}?shareError=${encodeURIComponent("Enter an email address to share with")}`);
  if (grantRole === "editor" && role !== "admin" && role !== "owner") {
    redirect(`${settingsPath}?shareError=${encodeURIComponent("Only the owner or an admin can grant editor access")}`);
  }
  if (email === viewer.email) {
    redirect(`${settingsPath}?shareError=${encodeURIComponent("You already have access")}`);
  }
  const target = await getUserByEmail(email);
  if (!target) {
    await createInvitation(hypcheckId, email, grantRole, viewer.id);
    log.info("hypcheck.invitation.created", { hypcheckId, email, role: grantRole });
    revalidatePath(settingsPath);
    redirect(settingsPath);
  }
  await grantAccess(hypcheckId, target.id, grantRole, viewer.id);
  log.info("hypcheck.access.granted", { hypcheckId, targetUserId: target.id, role: grantRole });
  revalidatePath(settingsPath);
  redirect(settingsPath);
}

/** Same grant matrix as granting: an editor may only remove viewer-level
 * grants; removing an editor takes an owner/admin. */
export async function revokeHypcheckAccessAction(hypcheckId: string, userId: string): Promise<void> {
  const { viewer, role } = await requireHypcheckAccess(hypcheckId, "editor");
  const log = actionLogger("revokeAccess", { userId: viewer.id, hypcheckId });
  const settingsPath = `/hypcheck/${hypcheckId}/settings`;
  const target = await getAccessGrant(hypcheckId, userId);
  if (target?.role === "editor" && role !== "admin" && role !== "owner") {
    redirect(`${settingsPath}?shareError=${encodeURIComponent("Only the owner or an admin can remove an editor")}`);
  }
  await revokeAccess(hypcheckId, userId);
  log.info("hypcheck.access.revoked", { hypcheckId, targetUserId: userId });
  revalidatePath(settingsPath);
}

/**
 * Change an existing member's role on a hypcheck. Same grant matrix as
 * grantHypcheckAccessAction: only an owner/admin may promote to editor; an
 * editor may only set viewer.
 */
export async function updateAccessRoleAction(hypcheckId: string, userId: string, formData: FormData): Promise<void> {
  const { viewer, role } = await requireHypcheckAccess(hypcheckId, "editor");
  const log = actionLogger("updateAccessRole", { userId: viewer.id, hypcheckId });
  const settingsPath = `/hypcheck/${hypcheckId}/settings`;
  const newRole: GrantRole = String(formData.get("role") ?? "viewer") === "editor" ? "editor" : "viewer";

  if (newRole === "editor" && role !== "admin" && role !== "owner") {
    redirect(`${settingsPath}?shareError=${encodeURIComponent("Only the owner or an admin can grant editor access")}`);
  }
  await grantAccess(hypcheckId, userId, newRole, viewer.id);
  log.info("hypcheck.access.roleChanged", { hypcheckId, targetUserId: userId, role: newRole });
  revalidatePath(settingsPath);
  // The role <select> is an uncontrolled element (defaultValue) — an
  // in-place RSC patch after the action doesn't update its displayed value,
  // so the UI shows the pre-change role until a real navigation happens.
  // Force one, same as grantHypcheckAccessAction/updateSettingsAction.
  redirect(settingsPath);
}

export async function revokeInvitationAction(hypcheckId: string, email: string): Promise<void> {
  const { viewer } = await requireHypcheckAccess(hypcheckId, "editor");
  const log = actionLogger("revokeInvitation", { userId: viewer.id, hypcheckId });
  await revokeInvitation(hypcheckId, email);
  log.info("hypcheck.invitation.revoked", { hypcheckId, email });
  revalidatePath(`/hypcheck/${hypcheckId}/settings`);
}

/**
 * Change a user's global role and model access — the only way to promote
 * someone to creator/admin now that signups no longer bootstrap as admin.
 * Admin-only, and an admin can't demote themselves — that's how you'd end up
 * with zero admins able to undo it. Model access rides in the same form:
 * every creator gets the base families (haiku, sonnet); the checkboxes grant
 * the premium ones (opus, fable) per user.
 */
export async function updateUserRoleAction(userId: string, formData: FormData): Promise<void> {
  const viewer = await requireAdmin();
  const log = actionLogger("updateUserRole", { userId: viewer.id, targetUserId: userId });
  const role = String(formData.get("role") ?? "") as GlobalRole;
  if (!["admin", "creator", "member"].includes(role)) return;
  if (userId === viewer.id) {
    redirect(`/admin?roleError=${encodeURIComponent("You can't change your own role")}`);
  }
  const extras = GRANTABLE_MODEL_FAMILIES.filter((f) => formData.get(`model_${f}`) === "on");
  await updateUserRole(userId, role);
  await updateModelAccess(userId, extras);
  log.info("user.role.changed", { targetUserId: userId, role, modelAccess: extras });
  revalidatePath("/admin");
  // Same fix as updateAccessRoleAction: the role <select> is uncontrolled
  // (defaultValue), so an in-place RSC patch never updates its displayed
  // value — force a real navigation.
  redirect("/admin");
}

/**
 * Add (or re-invite) an email to the global allowlist at a starting role —
 * the admin-console alternative to editing ALLOWED_EMAILS and redeploying.
 * If that email already has an account, sync its role immediately too:
 * otherwise the chosen role would only apply on a signup that's already
 * happened.
 */
export async function addAllowedEmailAction(formData: FormData): Promise<void> {
  const viewer = await requireAdmin();
  const log = actionLogger("addAllowedEmail", { userId: viewer.id });
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "member") as GlobalRole;
  if (!email) redirect(`/admin?roleError=${encodeURIComponent("Enter an email address to add")}`);
  if (!["admin", "creator", "member"].includes(role)) return;
  await addAllowedEmail(email, role, viewer.id);
  const existing = await getUserByEmail(email);
  if (existing) await updateUserRole(existing.id, role);
  log.info("admin.allowedEmail.added", { email, role, existingAccount: Boolean(existing) });
  revalidatePath("/admin");
}

/**
 * Revoke an email's access. Checked on every request (getViewer), so an
 * already-signed-in user is signed out on their very next one. An admin
 * can't revoke their own access — same reasoning as not being able to
 * demote themselves out of the only admin seat.
 */
export async function removeAllowedEmailAction(email: string): Promise<void> {
  const viewer = await requireAdmin();
  const log = actionLogger("removeAllowedEmail", { userId: viewer.id });
  const normalized = email.trim().toLowerCase();
  if (normalized === viewer.email.trim().toLowerCase()) {
    redirect(`/admin?roleError=${encodeURIComponent("You can't remove your own access")}`);
  }
  await removeAllowedEmail(normalized);
  log.info("admin.allowedEmail.removed", { email: normalized });
  revalidatePath("/admin");
}
