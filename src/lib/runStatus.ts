export type RunOutcome = "ok" | "error" | "timeout";

export interface RunTick {
  /** queued = dispatched to GitHub Actions, waiting for a runner to start. */
  status: "queued" | "running" | "ok" | "error";
  phase?: string;
  researchMs?: number;
}

/**
 * Watch a hypcheck's run attempt to completion by polling /api/health. Calls
 * `onTick` with the latest attempt state (status + phase) each poll, and
 * resolves with the terminal outcome. Runs execute on GitHub Actions, so the
 * budget covers runner start-up and `npm ci` (~1–2 min) on top of the engine's
 * 600 s research backstop, with headroom — a long run is never abandoned early.
 */
export async function watchRun(
  hypcheckId: string,
  opts: { since: number; onTick?: (t: RunTick) => void; timeoutMs?: number; intervalMs?: number }
): Promise<RunOutcome> {
  const timeoutMs = opts.timeoutMs ?? 20 * 60_000;
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
      if (a.status === "ok") return "ok";
      if (a.status === "error") return "error";
      // queued / running: keep polling
    } catch {
      // transient — keep polling
    }
  }
  return "timeout";
}
