import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/authz";
import { getTraceDetail, hypcheckNamesById } from "@/lib/store";
import { formatDateTime } from "@/lib/format";
import { TraceDetailBody } from "@/components/TraceTimeline";

export const dynamic = "force-dynamic";

export default async function AdminTraceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const detail = await getTraceDetail(id);
  if (!detail) notFound();
  const { trace, spans } = detail;
  const hypcheckName = trace.hypcheckId ? (await hypcheckNamesById([trace.hypcheckId])).get(trace.hypcheckId) : null;

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 lg:px-8">
      <div className="flex items-center gap-2 text-[12px] text-ink-faint">
        <Link href="/" className="transition-colors hover:text-ink">
          Dashboard
        </Link>
        <span aria-hidden>/</span>
        <Link href="/admin" className="transition-colors hover:text-ink">
          Admin
        </Link>
        <span aria-hidden>/</span>
        <Link href="/admin/traces" className="transition-colors hover:text-ink">
          API call profiling
        </Link>
        <span aria-hidden>/</span>
        <span className="text-ink-soft">{formatDateTime(trace.startedAt)}</span>
      </div>

      <TraceDetailBody
        trace={trace}
        spans={spans}
        hypcheckLink={hypcheckName && trace.hypcheckId ? { name: hypcheckName, href: `/hypcheck/${trace.hypcheckId}` } : undefined}
      />
    </div>
  );
}
