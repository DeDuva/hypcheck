"use client";

import { useState } from "react";
import { runNowAction } from "@/lib/actions";
import { RunProgress } from "./RunProgress";
import type { RunOutcome } from "@/lib/runStatus";

export function RunNowButton({ hypcheckId, live }: { hypcheckId: string; live: boolean }) {
  const [running, setRunning] = useState(false);
  const [since, setSince] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setError(null);
    const start = Date.now();
    setSince(start);
    setRunning(true);
    try {
      await runNowAction(hypcheckId); // returns immediately; research runs in the background
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Couldn’t start the run: ${message}`);
      setRunning(false);
    }
    // completion is handled by RunProgress (polls + auto-refreshes)
  }

  function onFinished(outcome: RunOutcome) {
    setRunning(false);
    if (outcome === "error") setError("The research run hit an error. See /api/health (lastAttempt) for details.");
    // "ok" refreshes the page in place; "timeout" is effectively never with the full budget.
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        disabled={running}
        onClick={run}
        className="inline-flex items-center gap-1.5 rounded-lg bg-iris px-3.5 py-2 text-[13px] font-medium text-white shadow-card transition-colors hover:bg-iris-deep disabled:cursor-wait disabled:opacity-60"
      >
        {running ? (
          <>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="animate-spin" aria-hidden>
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.3" />
              <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            {live ? "Researching…" : "Running…"}
          </>
        ) : (
          <>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M4 3.5v9l8-4.5-8-4.5z" fill="currentColor" />
            </svg>
            Run now
          </>
        )}
      </button>
      {running && <RunProgress hypcheckId={hypcheckId} since={since} onFinished={onFinished} />}
      {error && <p className="max-w-[260px] text-right text-[11.5px] leading-snug text-rose-600">{error}</p>}
    </div>
  );
}
