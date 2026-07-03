"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { watchRun, type RunOutcome } from "@/lib/runStatus";

function computePct(elapsedMs: number, phase: string | undefined, done: boolean): number {
  if (done) return 100;
  // Smooth, asymptotic ramp — always moving, never stalls, never reaches 100
  // until the run actually completes.
  let base = 90 * (1 - Math.exp(-elapsedMs / 180_000));
  if (phase === "research_done") base = Math.max(base, 90);
  return Math.min(96, base);
}

function phaseLabel(phase: string | undefined, elapsedMs: number): string {
  if (phase === "research_done") return "Synthesizing the analysis and writing the report…";
  if (elapsedMs < 4_000) return "Starting the run…";
  return "Researching the market — searching the web and gathering sources…";
}

function mmss(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Live progress for a background research run. Polls to completion, animates a
 * progress bar with phase-aware labels, and auto-refreshes the page when the
 * run lands — the user never has to take an extra step.
 */
export function RunProgress({
  hypcheckId,
  since,
  onFinished,
}: {
  hypcheckId: string;
  since: number;
  onFinished?: (outcome: RunOutcome) => void;
}) {
  const [elapsedMs, setElapsedMs] = useState(Date.now() - since);
  const [phase, setPhase] = useState<string | undefined>();
  const [done, setDone] = useState(false);
  const router = useRouter();
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  useEffect(() => {
    const timer = setInterval(() => setElapsedMs(Date.now() - since), 1000);
    let cancelled = false;

    watchRun(hypcheckId, { since, onTick: (t) => !cancelled && setPhase(t.phase) }).then((outcome) => {
      if (cancelled) return;
      clearInterval(timer);
      if (outcome === "ok") {
        setDone(true);
        // Brief beat so the bar visibly reaches 100%, then refresh in place.
        setTimeout(() => !cancelled && router.refresh(), 500);
      }
      onFinishedRef.current?.(outcome);
    });

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [hypcheckId, since, router]);

  const pct = computePct(elapsedMs, phase, done);

  return (
    <div className="w-full max-w-md">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12.5px] text-ink-soft">
          {done ? "Done — updating…" : phaseLabel(phase, elapsedMs)}
        </span>
        <span className="tnum shrink-0 text-[12px] text-ink-faint">{mmss(elapsedMs)}</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-paper ring-1 ring-inset ring-edge">
        <div
          className="h-full rounded-full bg-iris transition-[width] duration-1000 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
