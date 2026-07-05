import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getHypcheck, getRun, listRuns } from "@/lib/store";
import { formatDate, formatTime, stripReportPreamble } from "@/lib/format";
import { ModeBadge, ScoreChip, StanceBadge } from "@/components/ScoreChip";
import { DeltaBadge } from "@/components/DeltaBadge";
import { requireUser } from "@/lib/authz";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ id: string; runId: string }> }) {
  await requireUser();
  const { id, runId } = await params;
  const [hypcheck, run, runs] = await Promise.all([getHypcheck(id), getRun(runId), listRuns(id)]);
  if (!hypcheck || !run || run.hypcheckId !== id) notFound();

  const idx = runs.findIndex((r) => r.id === runId);
  const prior = idx > 0 ? runs[idx - 1] : null;
  const next = idx >= 0 && idx < runs.length - 1 ? runs[idx + 1] : null;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 lg:px-8">
      <div className="flex items-center gap-2 text-[12px] text-ink-faint">
        <Link href="/" className="transition-colors hover:text-ink">
          Dashboard
        </Link>
        <span aria-hidden>/</span>
        <Link href={`/hypcheck/${id}`} className="transition-colors hover:text-ink">
          {hypcheck.name}
        </Link>
        <span aria-hidden>/</span>
        <span className="text-ink-soft">Report · {formatDate(run.runAt)}</span>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-edge bg-surface px-5 py-4 shadow-card">
        <div className="flex items-center gap-3">
          <span className="tnum text-[30px] font-semibold leading-none tracking-tight">{Math.round(run.pmfScore)}</span>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <ScoreChip score={run.pmfScore} size="sm" />
              {prior && <DeltaBadge delta={run.pmfScore - prior.pmfScore} />}
            </div>
            <span className="text-[11.5px] text-ink-faint">
              Hypothesis v{run.hypothesisVersion} · confidence {Math.round(run.confidence * 100)}% · {formatTime(run.runAt)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ModeBadge mode={run.mode} />
          <div className="flex items-center gap-1">
            {prior && (
              <Link
                href={`/hypcheck/${id}/report/${prior.id}`}
                className="rounded-lg bg-surface px-2.5 py-1.5 text-[12px] font-medium text-ink-soft ring-1 ring-inset ring-edge transition-colors hover:bg-paper"
              >
                ← Prev run
              </Link>
            )}
            {next && (
              <Link
                href={`/hypcheck/${id}/report/${next.id}`}
                className="rounded-lg bg-surface px-2.5 py-1.5 text-[12px] font-medium text-ink-soft ring-1 ring-inset ring-edge transition-colors hover:bg-paper"
              >
                Next run →
              </Link>
            )}
          </div>
        </div>
      </div>

      {run.industryAnalysis && (
        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          <StanceBadge stance={run.industryAnalysis.stance} conviction={run.industryAnalysis.conviction} />
          <span className="text-[12px] text-ink-faint">Full industry analysis in the report below.</span>
        </div>
      )}

      <article className="report-md mt-6 rounded-2xl border border-edge bg-surface px-7 py-8 shadow-card">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripReportPreamble(run.reportMd)}</ReactMarkdown>
      </article>
    </div>
  );
}
