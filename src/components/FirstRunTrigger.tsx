"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runNowAction } from "@/lib/actions";

/** Auto-triggers the first research run once the user lands on a brand-new hypcheck. */
export function FirstRunTrigger({ hypcheckId, live }: { hypcheckId: string; live: boolean }) {
  const [, startTransition] = useTransition();
  const [phase, setPhase] = useState<"running" | "done" | "error">("running");
  const fired = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    startTransition(async () => {
      try {
        await runNowAction(hypcheckId);
        setPhase("done");
        router.refresh();
      } catch {
        setPhase("error");
      }
    });
  }, [hypcheckId, router]);

  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      {phase === "error" ? (
        <p className="text-[13px] text-ink-soft">
          The first run couldn&apos;t complete automatically — use &ldquo;Run now&rdquo; above to try again.
        </p>
      ) : (
        <>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="animate-spin text-iris" aria-hidden>
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.3" />
            <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <p className="text-[13px] text-ink-soft">
            {phase === "done"
              ? "First run complete — refreshing…"
              : live
                ? "Running your first live research check — this can take a minute…"
                : "Running your first check…"}
          </p>
        </>
      )}
    </div>
  );
}
