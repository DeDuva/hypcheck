import Link from "next/link";
import { notFound } from "next/navigation";
import { requireHypcheckAccess } from "@/lib/authz";
import { getTraceDetail } from "@/lib/store";
import { formatDateTime } from "@/lib/format";
import { TraceDetailBody } from "@/components/TraceTimeline";

export const dynamic = "force-dynamic";

export default async function HypcheckTraceDetailPage({ params }: { params: Promise<{ id: string; traceId: string }> }) {
  const { id, traceId } = await params;
  const { hypcheck } = await requireHypcheckAccess(id, "editor");
  const detail = await getTraceDetail(traceId);
  // A trace belongs to exactly one hypcheck (or none, for pre-creation refine
  // calls) — editor access to *this* hypcheck doesn't grant access to another's.
  if (!detail || detail.trace.hypcheckId !== id) notFound();
  const { trace, spans } = detail;

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 lg:px-8">
      <div className="flex items-center gap-2 text-[12px] text-ink-faint">
        <Link href="/" className="transition-colors hover:text-ink">
          Dashboard
        </Link>
        <span aria-hidden>/</span>
        <Link href={`/hypcheck/${id}`} className="transition-colors hover:text-ink">
          {hypcheck.name}
        </Link>
        <span aria-hidden>/</span>
        <Link href={`/hypcheck/${id}/traces`} className="transition-colors hover:text-ink">
          Profile
        </Link>
        <span aria-hidden>/</span>
        <span className="text-ink-soft">{formatDateTime(trace.startedAt)}</span>
      </div>

      <TraceDetailBody trace={trace} spans={spans} />
    </div>
  );
}
