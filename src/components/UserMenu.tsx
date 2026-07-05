"use client";

import { authClient } from "@/lib/auth-client";
import type { Viewer } from "@/lib/authz";

export function UserMenu({ viewer }: { viewer: Viewer }) {
  return (
    <div className="flex items-center gap-2.5">
      {viewer.image ? (
        // eslint-disable-next-line @next/next/no-img-element -- avatar from Google, tiny and unoptimizable
        <img src={viewer.image} alt="" className="h-7 w-7 shrink-0 rounded-full" referrerPolicy="no-referrer" />
      ) : (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-iris/10 text-[12px] font-semibold text-iris">
          {viewer.name.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium text-ink">{viewer.name}</span>
        <span className="block truncate text-[11px] text-ink-faint">{viewer.email}</span>
      </span>
      <button
        type="button"
        title="Sign out"
        onClick={async () => {
          await authClient.signOut();
          window.location.href = "/signin";
        }}
        className="shrink-0 rounded-md p-1.5 text-ink-faint transition-colors hover:bg-paper hover:text-ink"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M6 2.5H3.5v11H6M10.5 5l3 3-3 3M13 8H6.5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}
