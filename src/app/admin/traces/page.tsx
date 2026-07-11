import Link from "next/link";
import { requireAdmin } from "@/lib/authz";
import { hypcheckNamesById, listTraces } from "@/lib/store";
import { TraceTable } from "@/components/TraceTimeline";

export const dynamic = "force-dynamic";

export default async function AdminTracesPage() {
  await requireAdmin();
  const traces = await listTraces({ limit: 100 });
  const hypcheckIds = traces.map((t) => t.hypcheckId).filter((id): id is string => id != null);
  const names = await hypcheckNamesById(hypcheckIds);

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
        <span className="text-ink-soft">API call profiling</span>
      </div>

      <h1 className="mt-2 text-[22px] font-semibold tracking-tight">API call profiling</h1>
      <p className="mt-1 text-[12.5px] text-ink-faint">
        Every live research and hypothesis-refine call to Anthropic, across every hypcheck, with a per-phase timeline
        — thinking, each web search, and the final answer — so a slow run can be diagnosed instead of guessed at.
      </p>

      <div className="mt-6">
        <TraceTable traces={traces} traceHref={(id) => `/admin/traces/${id}`} hypcheckNames={names} />
      </div>
    </div>
  );
}
