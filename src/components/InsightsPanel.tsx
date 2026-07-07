import Link from "next/link";
import { acceptInsightAction, dismissInsightAction } from "@/lib/actions";
import type { Insight, InsightDirection } from "@/lib/types";
import { formatDateShort } from "@/lib/format";
import { DiffView } from "./DiffView";

const DIRECTION_META: Record<InsightDirection, { label: string; classes: string }> = {
  supporting: { label: "Supporting", classes: "bg-emerald-50 text-emerald-700" },
  challenging: { label: "Challenging", classes: "bg-rose-50 text-rose-700" },
  watch: { label: "Watch", classes: "bg-sky-50 text-sky-700" },
};

export function InsightCard({
  insight,
  currentStatement,
  hypcheckId,
  showActions = true,
}: {
  insight: Insight;
  currentStatement: string;
  hypcheckId: string;
  showActions?: boolean;
}) {
  const meta = DIRECTION_META[insight.direction];
  const isPendingProposal = insight.status === "new" && (insight.proposedRevision || insight.proposedWatchlistChange);

  return (
    <div
      className={`rounded-xl border p-4 ${
        isPendingProposal ? "border-amber-200 bg-amber-50/40" : "border-edge bg-surface"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ${meta.classes}`}>
            {meta.label}
          </span>
          {insight.status === "accepted" && (
            <span className="rounded-full bg-iris-soft px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-iris">
              {insight.proposedWatchlistChange ? "Accepted → watchlist updated" : "Accepted → new version"}
            </span>
          )}
          {insight.status === "dismissed" && (
            <span className="rounded-full bg-paper px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint ring-1 ring-inset ring-edge">
              Dismissed
            </span>
          )}
        </div>
        <Link
          href={`/hypcheck/${hypcheckId}/report/${insight.runId}`}
          className="shrink-0 text-[11.5px] font-medium text-ink-faint transition-colors hover:text-iris"
        >
          {formatDateShort(insight.createdAt)} run →
        </Link>
      </div>

      <h3 className="mt-2 text-[13.5px] font-semibold leading-snug">{insight.title}</h3>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{insight.body}</p>

      {insight.proposedRevision && (
        <div className="mt-3 rounded-lg border border-edge bg-surface p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            Proposed hypothesis revision
          </p>
          <div className="mt-1.5">
            <DiffView oldText={currentStatement} newText={insight.proposedRevision} />
          </div>
          {isPendingProposal && showActions && (
            <div className="mt-3 flex items-center gap-2">
              <form action={acceptInsightAction.bind(null, insight.id)}>
                <button
                  type="submit"
                  className="rounded-lg bg-iris px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-iris-deep"
                >
                  Accept revision
                </button>
              </form>
              <form action={dismissInsightAction.bind(null, insight.id)}>
                <button
                  type="submit"
                  className="rounded-lg bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-soft ring-1 ring-inset ring-edge transition-colors hover:bg-paper"
                >
                  Dismiss
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {insight.proposedWatchlistChange && (
        <div className="mt-3 rounded-lg border border-edge bg-surface p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Proposed watchlist change</p>
          <p className="mt-1.5 text-[13px] text-ink">
            <span className="font-medium">{insight.proposedWatchlistChange.action === "add" ? "Add" : "Remove"}</span>{" "}
            <span className="rounded-full bg-paper px-2 py-0.5 text-[12px] font-medium text-ink-soft ring-1 ring-inset ring-edge">
              {insight.proposedWatchlistChange.name}
            </span>
          </p>
          {isPendingProposal && showActions && (
            <div className="mt-3 flex items-center gap-2">
              <form action={acceptInsightAction.bind(null, insight.id)}>
                <button
                  type="submit"
                  className="rounded-lg bg-iris px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-iris-deep"
                >
                  {insight.proposedWatchlistChange.action === "add" ? "Add to watchlist" : "Remove from watchlist"}
                </button>
              </form>
              <form action={dismissInsightAction.bind(null, insight.id)}>
                <button
                  type="submit"
                  className="rounded-lg bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-soft ring-1 ring-inset ring-edge transition-colors hover:bg-paper"
                >
                  Dismiss
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {insight.status === "new" && !insight.proposedRevision && !insight.proposedWatchlistChange && showActions && (
        <form action={dismissInsightAction.bind(null, insight.id)} className="mt-2.5">
          <button
            type="submit"
            className="text-[11.5px] font-medium text-ink-faint transition-colors hover:text-ink"
          >
            Mark as read
          </button>
        </form>
      )}
    </div>
  );
}
