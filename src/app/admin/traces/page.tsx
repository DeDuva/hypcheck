import Link from "next/link";
import { requireAdmin } from "@/lib/authz";
import { hypcheckNamesById, listTraces } from "@/lib/store";
import { formatDateTime, formatMs } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  ok: "bg-emerald-50 text-emerald-700",
  error: "bg-rose-50 text-rose-700",
  running: "bg-amber-50 text-amber-700",
};

const KIND_LABEL: Record<string, string> = {
  research: "Research run",
  refine: "Hypothesis refine",
};

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
        Every live research and hypothesis-refine call to Anthropic, with a per-phase timeline — thinking, each web
        search, and the final answer — so a slow run can be diagnosed instead of guessed at.
      </p>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-edge bg-surface shadow-card">
        <table className="w-full text-left text-[12.5px]">
          <thead>
            <tr className="border-b border-edge text-[11px] uppercase tracking-wide text-ink-faint">
              <th className="px-4 py-2.5 font-medium">Started</th>
              <th className="px-4 py-2.5 font-medium">Hypcheck</th>
              <th className="px-4 py-2.5 font-medium">Kind</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Model</th>
              <th className="px-4 py-2.5 font-medium">Duration</th>
              <th className="px-4 py-2.5 font-medium">Tokens in/out</th>
              <th className="px-4 py-2.5 font-medium">Searches</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge">
            {traces.map((t) => (
              <tr key={t.id} className="transition-colors hover:bg-paper/60">
                <td className="whitespace-nowrap px-4 py-2.5">
                  <Link href={`/admin/traces/${t.id}`} className="text-iris hover:text-iris-deep">
                    {formatDateTime(t.startedAt)}
                  </Link>
                </td>
                <td className="max-w-[160px] truncate px-4 py-2.5 text-ink-soft">
                  {t.hypcheckId ? (names.get(t.hypcheckId) ?? t.hypcheckId) : <span className="text-ink-faint">—</span>}
                </td>
                <td className="px-4 py-2.5 text-ink-soft">{KIND_LABEL[t.kind] ?? t.kind}</td>
                <td className="px-4 py-2.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[t.status] ?? "bg-paper text-ink-faint"}`}
                  >
                    {t.status}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-ink-faint">{t.model}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-ink-soft">{formatMs(t.durationMs)}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-ink-faint">
                  {t.inputTokens ?? "—"} / {t.outputTokens ?? "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-ink-faint">{t.searches ?? "—"}</td>
              </tr>
            ))}
            {traces.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-ink-faint">
                  No API calls recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
