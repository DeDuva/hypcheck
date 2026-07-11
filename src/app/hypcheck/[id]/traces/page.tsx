import Link from "next/link";
import { requireHypcheckAccess } from "@/lib/authz";
import { listTraces } from "@/lib/store";
import { TraceTable } from "@/components/TraceTimeline";

export const dynamic = "force-dynamic";

export default async function HypcheckTracesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { hypcheck } = await requireHypcheckAccess(id, "editor");
  const traces = await listTraces({ hypcheckId: id, limit: 100 });

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
        <span className="text-ink-soft">Profile</span>
      </div>

      <h1 className="mt-2 text-[22px] font-semibold tracking-tight">Profile</h1>
      <p className="mt-1 text-[12.5px] text-ink-faint">
        Every live research call for this hypcheck, with a per-phase timeline — thinking, each web search, and the
        final answer — so a slow run can be diagnosed instead of guessed at.
      </p>

      <div className="mt-6">
        <TraceTable traces={traces} traceHref={(traceId) => `/hypcheck/${id}/traces/${traceId}`} />
      </div>
    </div>
  );
}
