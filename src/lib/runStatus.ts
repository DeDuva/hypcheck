export type RunOutcome = "ok" | "error" | "timeout";

export interface RunTick {
  status: "running" | "ok" | "error";
  phase?: string;
  researchMs?: number;
}

/**
 * Watch a hypcheck's run attempt to completion by polling /api/health. Calls
 * `onTick` with the latest attempt state (status + phase) each poll, and
 * resolves with the terminal outcome. The timeout matches the server function
 * budget so a legitimately long run is never abandoned before it finishes.
 */
export async function watchRun(
  hypcheckId: string,
  opts: { since: number; onTick?: (t: RunTick) => void; timeoutMs?: number; intervalMs?: number }
): Promise<RunOutcome> {
  const timeoutMs = opts.timeoutMs ?? 780_000; // just under the 800s function budget
  const intervalMs = opts.intervalMs ?? 3_000;
  const { since } = opts;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, intervalMs));
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      if (!res.ok) continue;
      const data = await res.json();
      const a = data?.lastAttempt;
      if (!a || a.hypcheckId !== hypcheckId) continue;
      const updated = new Date(a.updatedAt ?? a.startedAt).getTime();
      if (updated < since - 5_000) continue; // stale marker from a prior run
      opts.onTick?.({ status: a.status, phase: a.phase, researchMs: a.researchMs });
      if (a.status !== "running") return a.status === "ok" ? "ok" : "error";
    } catch {
      // transient — keep polling
    }
  }
  return "timeout";
}
