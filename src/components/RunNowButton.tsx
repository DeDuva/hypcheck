"use client";

import { useTransition } from "react";
import { runNowAction } from "@/lib/actions";

export function RunNowButton({ hypcheckId, live }: { hypcheckId: string; live: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => runNowAction(hypcheckId))}
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
  );
}
