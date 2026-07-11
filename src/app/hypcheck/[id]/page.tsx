import Link from "next/link";
import { listInsights, listMetrics, listRuns, listVersions } from "@/lib/store";
import { CADENCE_LABELS, DEPTH_LABELS, scoreBand, WATCHLIST_CATEGORY_LABELS } from "@/lib/types";
import { formatDate, formatDateShort, relativeDays } from "@/lib/format";
import { PmfChart, type ChartPoint } from "@/components/PmfChart";
import { ModeBadge, ScoreChip } from "@/components/ScoreChip";
import { DeltaBadge } from "@/components/DeltaBadge";
import { InsightCard } from "@/components/InsightsPanel";
import { RunNowButton } from "@/components/RunNowButton";
import { FirstRunTrigger } from "@/components/FirstRunTrigger";
import { DiffView } from "@/components/DiffView";
import { reviseHypothesisAction } from "@/lib/actions";
import { requireHypcheckAccess } from "@/lib/authz";

export const dynamic = "force-dynamic";
// This route hosts runNowAction, whose after() callback runs the (long) live
// research in the background — so it needs the extended budget. Pro + Fluid
// Compute (default) allows up to 800s.
export const maxDuration = 800;

export default async function HypcheckOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { hypcheck, role } = await requireHypcheckAccess(id, "viewer");
  const canEdit = role === "editor" || role === "owner" || role === "admin";

  const [runs, versions, insights, metrics] = await Promise.all([
    listRuns(id),
    listVersions(id),
    listInsights(id),
    listMetrics(id),
  ]);
  const current = versions[0];
  const latest = runs[runs.length - 1];
  const prev = runs[runs.length - 2];

  const points: ChartPoint[] = runs.map((r, i) => ({
    runId: r.id,
    date: r.runAt,
    score: r.pmfScore,
    execSummary: r.execSummary,
    version: r.hypothesisVersion,
    mode: r.mode,
    versionChange: i > 0 && r.hypothesisVersion !== runs[i - 1].hypothesisVersion,
    carriedForward: r.metricScores.length > 0 && r.metricScores.every((ms) => ms.carriedForward),
  }));

  const pendingProposals = insights.filter((i) => i.status === "new" && (i.proposedRevision || i.proposedWatchlistChange));
  const otherInsights = insights
    .filter((i) => !(i.status === "new" && (i.proposedRevision || i.proposedWatchlistChange)))
    .slice(0, 8);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 lg:px-10">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[12px] text-ink-faint">
            <Link href="/" className="transition-colors hover:text-ink">
              Dashboard
            </Link>
            <span aria-hidden>/</span>
            <span className="text-ink-soft">{hypcheck.name}</span>
          </div>
          <h1 className="mt-1.5 text-[22px] font-semibold tracking-tight">{hypcheck.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2.5 text-[12.5px] text-ink-faint">
            <span>{CADENCE_LABELS[hypcheck.cadence]} runs</span>
            <span aria-hidden>·</span>
            <span>{DEPTH_LABELS[hypcheck.depth]}</span>
            {hypcheck.nextRunAt && hypcheck.status === "active" && (
              <>
                <span aria-hidden>·</span>
                <span>Next run {relativeDays(hypcheck.nextRunAt)}</span>
              </>
            )}
            {hypcheck.status === "paused" && (
              <span className="rounded-full bg-paper px-2 py-0.5 font-medium text-ink-faint ring-1 ring-inset ring-edge">
                Paused
              </span>
            )}
          </div>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Link
              href={`/hypcheck/${id}/traces`}
              className="rounded-lg bg-surface px-3.5 py-2 text-[13px] font-medium text-ink-soft ring-1 ring-inset ring-edge transition-colors hover:bg-paper"
            >
              Profile
            </Link>
            <Link
              href={`/hypcheck/${id}/settings`}
              className="rounded-lg bg-surface px-3.5 py-2 text-[13px] font-medium text-ink-soft ring-1 ring-inset ring-edge transition-colors hover:bg-paper"
            >
              Settings
            </Link>
            <RunNowButton hypcheckId={id} live={Boolean(process.env.ANTHROPIC_API_KEY)} />
          </div>
        )}
      </div>

      {/* Score summary + hypothesis */}
      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-2xl border border-edge bg-surface p-5 shadow-card">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-faint">Hypothesis</h2>
            <span className="rounded-full bg-iris-soft px-2.5 py-0.5 text-[11.5px] font-semibold text-iris">
              v{current.version}
            </span>
          </div>
          <blockquote className="mt-3 border-l-[3px] border-iris pl-4 text-[14.5px] leading-relaxed text-ink">
            {current.statement}
          </blockquote>
          {current.changeSummary && (
            <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-faint">
              <span className="font-medium text-ink-soft">Last revision:</span> {current.changeSummary}
            </p>
          )}

          {versions.length > 1 && (
            <details className="group mt-4">
              <summary className="cursor-pointer select-none text-[12.5px] font-medium text-iris transition-colors hover:text-iris-deep">
                Version history ({versions.length})
              </summary>
              <ol className="mt-3 space-y-3 border-l border-edge pl-4">
                {versions.map((v, i) => {
                  const older = versions[i + 1];
                  return (
                    <li key={v.id}>
                      <div className="flex items-center gap-2 text-[12px] text-ink-faint">
                        <span className="font-semibold text-ink-soft">v{v.version}</span>
                        <span>{formatDate(v.createdAt)}</span>
                        <span className="rounded-full bg-paper px-1.5 py-px text-[10.5px] uppercase tracking-wide ring-1 ring-inset ring-edge">
                          {v.source}
                        </span>
                      </div>
                      {v.changeSummary && <p className="mt-1 text-[12.5px] text-ink-soft">{v.changeSummary}</p>}
                      <div className="mt-1.5">
                        {older ? (
                          <DiffView oldText={older.statement} newText={v.statement} />
                        ) : (
                          <p className="text-[13px] leading-relaxed text-ink-soft">{v.statement}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </details>
          )}

          <details className="group mt-3">
            <summary className="cursor-pointer select-none text-[12.5px] font-medium text-ink-faint transition-colors hover:text-ink">
              Revise manually
            </summary>
            <form action={reviseHypothesisAction.bind(null, id)} className="mt-3 space-y-2.5">
              <textarea
                name="statement"
                defaultValue={current.statement}
                rows={4}
                required
                className="w-full rounded-lg border border-edge bg-paper/50 px-3 py-2 text-[13px] leading-relaxed outline-none transition-colors focus:border-iris focus:bg-surface"
              />
              <input
                name="changeSummary"
                placeholder="What changed, and why? (shown in version history)"
                className="w-full rounded-lg border border-edge bg-paper/50 px-3 py-2 text-[13px] outline-none transition-colors focus:border-iris focus:bg-surface"
              />
              <button
                type="submit"
                className="rounded-lg bg-iris px-3 py-1.5 text-[12.5px] font-medium text-white transition-colors hover:bg-iris-deep"
              >
                Save as v{current.version + 1}
              </button>
            </form>
          </details>
        </section>

        <section className="flex flex-col justify-between rounded-2xl border border-edge bg-surface p-5 shadow-card">
          <div>
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-faint">Current PMF score</h2>
            {latest ? (
              <>
                <div className="mt-3 flex items-baseline gap-2.5">
                  <span className="tnum text-[44px] font-semibold leading-none tracking-tight">
                    {Math.round(latest.pmfScore)}
                  </span>
                  {prev && <DeltaBadge delta={latest.pmfScore - prev.pmfScore} />}
                </div>
                <div className="mt-2.5 flex items-center gap-2">
                  <ScoreChip score={latest.pmfScore} />
                  <ModeBadge mode={latest.mode} />
                </div>
                <p className="mt-3 text-[12px] text-ink-faint">
                  Last run {formatDate(latest.runAt)} · confidence {Math.round(latest.confidence * 100)}%
                </p>
              </>
            ) : (
              <p className="mt-3 text-[13px] text-ink-soft">No runs yet.</p>
            )}
          </div>
          {latest && (
            <div className="mt-4 space-y-1.5 border-t border-edge pt-3.5">
              {latest.metricScores.map((ms) => {
                const band = scoreBand(ms.score);
                return (
                  <div key={ms.name} className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[12.5px] text-ink-soft">{ms.name}</span>
                      {ms.carriedForward && (
                        <span
                          className="shrink-0 rounded-full bg-paper px-1.5 py-px text-[10px] font-medium text-ink-faint ring-1 ring-inset ring-edge"
                          title="No fresh evidence this run — the prior score carried forward"
                        >
                          carried
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-paper">
                        <div
                          className={`h-full rounded-full ${
                            band.key === "strong"
                              ? "bg-emerald-500"
                              : band.key === "promising"
                                ? "bg-teal-500"
                                : band.key === "emerging"
                                  ? "bg-amber-500"
                                  : "bg-rose-500"
                          }`}
                          style={{ width: `${ms.score}%` }}
                        />
                      </div>
                      <span className="tnum w-6 text-right text-[12px] font-medium text-ink-soft">
                        {Math.round(ms.score)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Chart */}
      <section className="mt-4 rounded-2xl border border-edge bg-surface p-5 shadow-card">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-faint">PMF score over time</h2>
          <p className="text-[12px] text-ink-faint">Hover for the run summary · click a point to pin it</p>
        </div>
        {points.length ? (
          <PmfChart points={points} hypcheckId={id} />
        ) : (
          <FirstRunTrigger hypcheckId={id} live={Boolean(process.env.ANTHROPIC_API_KEY)} />
        )}
      </section>

      {/* Insights + run history */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section>
          <div className="mb-2.5 flex items-center justify-between px-1">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-faint">Insights</h2>
            {pendingProposals.length > 0 && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                {pendingProposals.length} proposal{pendingProposals.length > 1 ? "s" : ""} awaiting review
              </span>
            )}
          </div>
          <div className="space-y-3">
            {pendingProposals.map((insight) => (
              <InsightCard key={insight.id} insight={insight} currentStatement={current.statement} hypcheckId={id} />
            ))}
            {otherInsights.map((insight) => (
              <InsightCard key={insight.id} insight={insight} currentStatement={current.statement} hypcheckId={id} />
            ))}
            {insights.length === 0 && (
              <p className="rounded-xl border border-dashed border-edge-strong bg-surface p-5 text-center text-[13px] text-ink-soft">
                No insights yet — they’ll appear here as runs surface evidence.
              </p>
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-2.5 px-1 text-[13px] font-semibold uppercase tracking-wide text-ink-faint">Run history</h2>
          <div className="overflow-hidden rounded-xl border border-edge bg-surface shadow-card">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-edge text-left text-[11.5px] uppercase tracking-wide text-ink-faint">
                  <th className="px-4 py-2.5 font-semibold">Date</th>
                  <th className="px-2 py-2.5 font-semibold">Score</th>
                  <th className="px-2 py-2.5 font-semibold">Δ</th>
                  <th className="px-2 py-2.5 font-semibold">Hyp.</th>
                  <th className="px-2 py-2.5 font-semibold">Mode</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Report</th>
                </tr>
              </thead>
              <tbody>
                {[...runs].reverse().map((run, i, arr) => {
                  const prior = arr[i + 1];
                  return (
                    <tr key={run.id} className="border-b border-edge last:border-0 hover:bg-paper/60">
                      <td className="px-4 py-2.5 text-ink-soft">{formatDateShort(run.runAt)}</td>
                      <td className="tnum px-2 py-2.5 font-semibold">{Math.round(run.pmfScore)}</td>
                      <td className="px-2 py-2.5">
                        {prior ? <DeltaBadge delta={run.pmfScore - prior.pmfScore} /> : <span className="text-ink-faint">—</span>}
                      </td>
                      <td className="px-2 py-2.5 text-ink-faint">v{run.hypothesisVersion}</td>
                      <td className="px-2 py-2.5">
                        <ModeBadge mode={run.mode} />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Link
                          href={`/hypcheck/${id}/report/${run.id}`}
                          className="font-medium text-iris transition-colors hover:text-iris-deep"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {metrics.length > 0 && (
            <div className="mt-4 rounded-xl border border-edge bg-surface p-4 shadow-card">
              <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint">Tracked metrics</h3>
              <ul className="mt-2.5 space-y-2">
                {metrics.map((m) => (
                  <li key={m.id} className="text-[12.5px] leading-relaxed">
                    <span className="font-medium text-ink">{m.name}</span>
                    <span className="text-ink-faint"> · weight {m.weight}/5</span>
                    <p className="text-ink-soft">{m.description}</p>
                    {m.signals && <p className="text-[12px] text-ink-faint">Watches: {m.signals}</p>}
                  </li>
                ))}
              </ul>
              {hypcheck.watchlist.length > 0 && (
                <>
                  <h3 className="mt-4 text-[12px] font-semibold uppercase tracking-wide text-ink-faint">Watchlist</h3>
                  <ul className="mt-2 space-y-1.5">
                    {hypcheck.watchlist.map((w) => (
                      <li key={w.name} className="flex items-start justify-between gap-3 text-[12.5px]">
                        <span>
                          <span className="font-medium text-ink">{w.name}</span>
                          {w.reason && <span className="text-ink-faint"> — {w.reason}</span>}
                        </span>
                        {w.category && (
                          <span className="shrink-0 rounded-full bg-paper px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-faint ring-1 ring-inset ring-edge">
                            {WATCHLIST_CATEGORY_LABELS[w.category]}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
