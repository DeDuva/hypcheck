"use client";

import { useEffect, useRef, useState } from "react";
import { runNowAction } from "@/lib/actions";
import { RunProgress } from "./RunProgress";
import type { RunOutcome } from "@/lib/runStatus";

/** Auto-triggers the first research run once the user lands on a brand-new hypcheck. */
export function FirstRunTrigger({ hypcheckId, live }: { hypcheckId: string; live: boolean }) {
  const [since, setSince] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    const start = Date.now();
    setSince(start);
    runNowAction(hypcheckId).catch(() => {
      setError("The first run couldn’t start — use “Run now” above to try again.");
    });
  }, [hypcheckId]);

  function onFinished(outcome: RunOutcome) {
    if (outcome === "error") setError("The first run hit an error — use “Run now” above to try again.");
    // "ok" auto-refreshes; the chart appears with the new run.
  }

  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      {error ? (
        <p className="text-[13px] text-ink-soft">{error}</p>
      ) : (
        <>
          <p className="text-[13px] text-ink-soft">
            {live
              ? "Running your first live research check. This takes a few minutes and updates automatically — no need to refresh."
              : "Running your first check…"}
          </p>
          {since !== null && (
            <div className="w-full max-w-md">
              <RunProgress hypcheckId={hypcheckId} since={since} onFinished={onFinished} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
