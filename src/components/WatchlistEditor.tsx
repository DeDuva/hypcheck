"use client";

import { useState } from "react";
import type { WatchlistEntry } from "@/lib/types";
import { WATCHLIST_CATEGORY_LABELS } from "@/lib/types";

const inputCls =
  "w-full rounded-lg border border-edge bg-paper/50 px-3 py-2 text-[13.5px] outline-none transition-colors focus:border-iris focus:bg-surface";

/**
 * Client-side watchlist editor for the settings form. Renders name + reason
 * rows (reason editable inline, not a hover tooltip) and serializes the
 * current list into a hidden `watchlistJson` field so it round-trips through
 * the surrounding server-action form without losing reasons on save.
 */
export function WatchlistEditor({ initial }: { initial: WatchlistEntry[] }) {
  const [entries, setEntries] = useState<WatchlistEntry[]>(initial);
  const [input, setInput] = useState("");
  const [editing, setEditing] = useState<number | null>(null);

  function add() {
    const name = input.trim();
    if (name && !entries.some((e) => e.name.toLowerCase() === name.toLowerCase())) {
      setEntries((es) => [...es, { name, reason: "" }]);
    }
    setInput("");
  }

  function setReason(i: number, reason: string) {
    setEntries((es) => es.map((e, ei) => (ei === i ? { ...e, reason } : e)));
  }

  return (
    <div>
      <label htmlFor="hc-watch-input" className="text-[12.5px] font-semibold text-ink">
        Watchlist
      </label>
      <p className="mt-0.5 text-[12px] text-ink-faint">
        Companies, products, or competitive signals checked each run — the reason travels into every future run&apos;s
        prompt, so it&apos;s worth keeping current.
      </p>

      {entries.length > 0 && (
        <div className="mt-1.5 divide-y divide-edge rounded-lg border border-edge bg-paper/40">
          {entries.map((w, i) => (
            <div key={w.name} className="flex items-start justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-ink">{w.name}</p>
                {editing === i ? (
                  <input
                    autoFocus
                    defaultValue={w.reason}
                    placeholder="Why watch this?"
                    onBlur={(e) => {
                      setReason(i, e.target.value.trim());
                      setEditing(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") setEditing(null);
                    }}
                    className="mt-1 w-full rounded-md border border-iris bg-surface px-2 py-1 text-[12px] outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditing(i)}
                    className="mt-0.5 block text-left text-[12px] leading-relaxed text-ink-faint transition-colors hover:text-iris"
                  >
                    {w.reason || "+ Add reason"}
                  </button>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2 pt-0.5">
                {w.category && (
                  <span className="rounded-full bg-iris-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-iris">
                    {WATCHLIST_CATEGORY_LABELS[w.category]}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setEntries((es) => es.filter((_, ei) => ei !== i))}
                  aria-label={`Remove ${w.name}`}
                  className="rounded-md p-1 text-ink-faint transition-colors hover:bg-paper hover:text-rose-600"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <input
        id="hc-watch-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          }
        }}
        placeholder="e.g. Gong, Clari, Salesforce Einstein Copilot — press Enter to add"
        className={`mt-1.5 ${inputCls}`}
      />

      <input type="hidden" name="watchlistJson" value={JSON.stringify(entries)} />
    </div>
  );
}
