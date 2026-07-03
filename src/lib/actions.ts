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
  updateHypcheckSettings,
  type CreateHypcheckInput,
} from "./store";
import type { Cadence, Depth, RefineResult } from "./types";

export async function refineAction(statement: string): Promise<RefineResult & { mode: "live" | "heuristic" }> {
  return refineHypothesis(statement);
}

export async function createHypcheckAction(input: CreateHypcheckInput): Promise<void> {
  const hypcheck = await createHypcheck(input);
  // The first run (especially live research) can take well past a platform
  // request timeout, so don't block navigation on it — the overview page
  // triggers it client-side via runNowAction once the user lands there.
  revalidatePath("/", "layout");
  redirect(`/hypcheck/${hypcheck.id}`);
}

export async function runNowAction(hypcheckId: string): Promise<void> {
  const hypcheck = await getHypcheck(hypcheckId);
  if (!hypcheck) throw new Error("Hypcheck not found");
  await executeRun(hypcheck);
  revalidatePath("/", "layout");
}

export async function acceptInsightAction(insightId: string): Promise<void> {
  const insight = await getInsight(insightId);
  if (!insight?.proposedRevision) throw new Error("Insight has no proposed revision");
  await addVersion(
    insight.hypcheckId,
    insight.proposedRevision,
    `Accepted insight: ${insight.title}`,
    "insight"
  );
  await setInsightStatus(insightId, "accepted");
  revalidatePath("/", "layout");
}

export async function dismissInsightAction(insightId: string): Promise<void> {
  await setInsightStatus(insightId, "dismissed");
  revalidatePath("/", "layout");
}

export async function reviseHypothesisAction(hypcheckId: string, formData: FormData): Promise<void> {
  const statement = String(formData.get("statement") ?? "").trim();
  const changeSummary = String(formData.get("changeSummary") ?? "").trim();
  if (!statement) throw new Error("Statement required");
  await addVersion(hypcheckId, statement, changeSummary || "Manual revision", "manual");
  revalidatePath("/", "layout");
}

export async function updateSettingsAction(hypcheckId: string, formData: FormData): Promise<void> {
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
}

export async function deleteHypcheckAction(hypcheckId: string): Promise<void> {
  await deleteHypcheck(hypcheckId);
  revalidatePath("/", "layout");
  redirect("/");
}
