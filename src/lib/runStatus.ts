export type RunOutcome = "ok" | "error" | "timeout";

/**
 * Poll /api/health until the given hypcheck's run attempt reaches a terminal
 * state. The research runs in the background (decoupled from the click), so the
 * client watches the persisted attempt marker instead of awaiting the action.
 */
export async function pollRun(
  hypcheckId: string,
  opts: { timeoutMs?: number; intervalMs?: number; since?: number } = {}
): Promise<RunOutcome> {
  const timeoutMs = opts.timeoutMs ?? 330_000; // a little over the 300s function budget
  const intervalMs = opts.intervalMs ?? 4_000;
  const since = opts.since ?? Date.now();
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, intervalMs));
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      if (!res.ok) continue;
      const data = await res.json();
      const a = data?.lastAttempt;
      if (
        a &&
        a.hypcheckId === hypcheckId &&
        a.status !== "running" &&
        new Date(a.updatedAt ?? a.startedAt).getTime() >= since - 5_000
      ) {
        return a.status === "ok" ? "ok" : "error";
      }
    } catch {
      // transient — keep polling
    }
  }
  return "timeout";
}
