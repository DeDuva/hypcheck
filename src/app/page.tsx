import Link from "next/link";
import { countPendingProposals, listHypchecks, listRuns } from "@/lib/store";
import { CADENCE_LABELS, scoreBand } from "@/lib/types";
import { relativeDays } from "@/lib/format";
import { ScoreChip } from "@/components/ScoreChip";
import { Sparkline } from "@/components/Sparkline";
import { DeltaBadge } from "@/components/DeltaBadge";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const hypchecks = await listHypchecks();
  const cards = await Promise.all(
    hypchecks.map(async (h) => {
      const runs = await listRuns(h.id);
      const pending = await countPendingProposals(h.id);
      return { hypcheck: h, runs, pending };
    })
  );

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 lg:px-10">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-[13.5px] text-ink-soft">
            Longitudinal product-market-fit signal across your hypotheses.
          </p>
        </div>
        <Link
          href="/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-iris px-3.5 py-2 text-[13px] font-medium text-white shadow-card transition-colors hover:bg-iris-deep"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          New hypcheck
        </Link>
      </div>

      {cards.length === 0 ? (
        <div className="mt-16 flex flex-col items-center rounded-2xl border border-dashed border-edge-strong bg-surface px-8 py-16 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-iris-soft text-iris">
            <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M1.5 11.5L5 7l2.5 2.5L11 5l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <h2 className="mt-4 text-[16px] font-semibold">No hypchecks yet</h2>
          <p className="mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-ink-soft">
            Define a product hypothesis and Hypcheck will research the market on a schedule, score PMF signal, and
            track it over time.
          </p>
          <Link
            href="/new"
            className="mt-6 rounded-lg bg-iris px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-iris-deep"
          >
            Create your first hypcheck
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          {cards.map(({ hypcheck, runs, pending }) => {
            const latest = runs[runs.length - 1];
            const prev = runs[runs.length - 2];
            const scores = runs.map((r) => r.pmfScore);
            return (
              <Link
                key={hypcheck.id}
                href={`/hypcheck/${hypcheck.id}`}
                className="group rounded-2xl border border-edge bg-surface p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lift"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate text-[15px] font-semibold tracking-tight group-hover:text-iris">
                        {hypcheck.name}
                      </h2>
                      {hypcheck.status === "paused" && (
                        <span className="rounded-full bg-paper px-2 py-0.5 text-[10.5px] font-medium text-ink-faint ring-1 ring-inset ring-edge">
                          Paused
                        </span>
                      )}
                    </div>
                    {latest && (
                      <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-ink-soft">
                        {latest.execSummary}
                      </p>
                    )}
                  </div>
                  {latest && (
                    <div className="flex shrink-0 flex-col items-end">
                      <div className="flex items-baseline gap-1.5">
                        <span className="tnum text-[26px] font-semibold leading-none tracking-tight">
                          {Math.round(latest.pmfScore)}
                        </span>
                        {prev && <DeltaBadge delta={latest.pmfScore - prev.pmfScore} />}
                      </div>
                      <div className="mt-1.5">
                        <ScoreChip score={latest.pmfScore} size="sm" />
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex items-end justify-between">
                  <div className="flex items-center gap-3 text-[12px] text-ink-faint">
                    <span>{CADENCE_LABELS[hypcheck.cadence]}</span>
                    <span aria-hidden>·</span>
                    <span>{runs.length} runs</span>
                    {hypcheck.nextRunAt && hypcheck.status === "active" && (
                      <>
                        <span aria-hidden>·</span>
                        <span>Next run {relativeDays(hypcheck.nextRunAt)}</span>
                      </>
                    )}
                    {pending > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
                        {pending} proposal{pending > 1 ? "s" : ""} pending
                      </span>
                    )}
                  </div>
                  <Sparkline scores={scores} />
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {cards.length > 0 && (
        <p className="mt-8 text-[12px] text-ink-faint">
          Bands: <span className="text-rose-600 font-medium">weak</span> &lt; 40 ·{" "}
          <span className="text-amber-600 font-medium">emerging</span> 40–54 ·{" "}
          <span className="text-teal-600 font-medium">promising</span> 55–69 ·{" "}
          <span className="text-emerald-600 font-medium">strong</span> ≥ 70
        </p>
      )}
    </div>
  );
}
