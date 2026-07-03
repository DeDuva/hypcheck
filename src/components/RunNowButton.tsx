"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runNowAction } from "@/lib/actions";

export function RunNowButton({ hypcheckId, live }: { hypcheckId: string; live: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function run() {
    setError(null);
    startTransition(async () => {
      try {
        await runNowAction(hypcheckId);
        router.refresh();
      } catch (err) {
        // A rejected action must never bubble to the error boundary (that
        // white-screens the app). Surface it inline instead. Server-action
        // timeouts reject with a generic "unexpected response" message.
        const message = err instanceof Error ? err.message : String(err);
        setError(
          /unexpected response|Failed to fetch|network/i.test(message)
            ? "The run didn’t finish — it may have timed out. Check the logs and try again."
            : `Run failed: ${message}`
        );
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={run}
        className="inline-flex items-center gap-1.5 rounded-lg bg-iris px-3.5 py-2 text-[13px] font-medium text-white shadow-card transition-colors hover:bg-iris-deep disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? (
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
      {error && <p className="max-w-[220px] text-right text-[11.5px] leading-snug text-rose-600">{error}</p>}
    </div>
  );
}
