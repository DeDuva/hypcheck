import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/authz";
import { getTraceDetail, hypcheckNamesById } from "@/lib/store";
import { formatDateTime, formatMs } from "@/lib/format";
import type { TraceSpanKind } from "@/lib/types";

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

// Fixed categorical order, validated for CVD separation with scripts/validate_palette.js
// ("#4f46e5,#0d9488,#d97706,#e11d48" — all checks pass). "thinking" reuses the app's
// existing --color-iris token; the others are never reused for anything else on this page.
const SPAN_STYLE: Record<TraceSpanKind, { bar: string; text: string; bg: string }> = {
  thinking: { bar: "bg-iris", text: "text-iris", bg: "bg-iris-soft" },
  web_search_query: { bar: "bg-teal-600", text: "text-teal-700", bg: "bg-teal-50" },
  web_search_result: { bar: "bg-amber-600", text: "text-amber-700", bg: "bg-amber-50" },
  text_output: { bar: "bg-rose-600", text: "text-rose-700", bg: "bg-rose-50" },
  other: { bar: "bg-edge-strong", text: "text-ink-faint", bg: "bg-paper" },
};

const SPAN_KIND_LABEL: Record<TraceSpanKind, string> = {
  thinking: "Thinking",
  web_search_query: "Web search",
  web_search_result: "Search results",
  text_output: "Response text",
  other: "Other",
};

export default async function TraceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const detail = await getTraceDetail(id);
  if (!detail) notFound();
  const { trace, spans } = detail;
  const hypcheckName = trace.hypcheckId ? (await hypcheckNamesById([trace.hypcheckId])).get(trace.hypcheckId) : null;
  const totalMs = trace.durationMs ?? Math.max(1, ...spans.map((s) => s.startMs + s.durationMs));

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

      <div className="mt-2 flex items-center gap-2.5">
        <h1 className="text-[20px] font-semibold tracking-tight">{KIND_LABEL[trace.kind] ?? trace.kind}</h1>
        <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-medium ${STATUS_STYLE[trace.status] ?? "bg-paper text-ink-faint"}`}>
          {trace.status}
        </span>
      </div>
      {hypcheckName && trace.hypcheckId && (
        <p className="mt-1 text-[12.5px] text-ink-faint">
          <Link href={`/hypcheck/${trace.hypcheckId}`} className="text-iris hover:text-iris-deep">
            {hypcheckName}
          </Link>
        </p>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3 rounded-2xl border border-edge bg-surface p-5 text-[12.5px] shadow-card sm:grid-cols-4">
        <Stat label="Started" value={formatDateTime(trace.startedAt)} />
        <Stat label="Duration" value={formatMs(trace.durationMs)} />
        <Stat label="Model" value={trace.model} />
        <Stat label="Stop reason" value={trace.stopReason ?? "—"} />
        <Stat label="Input tokens" value={trace.inputTokens?.toLocaleString() ?? "—"} />
        <Stat label="Output tokens" value={trace.outputTokens?.toLocaleString() ?? "—"} />
        <Stat label="Searches" value={trace.searches?.toString() ?? "—"} />
      </div>

      {trace.error && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-[12.5px] text-rose-700">
          <p className="font-medium">Error</p>
          <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[11.5px]">{trace.error}</pre>
        </div>
      )}

      <details className="mt-4 rounded-2xl border border-edge bg-surface p-5 shadow-card">
        <summary className="cursor-pointer text-[13px] font-semibold text-ink">Full request prompt</summary>
        <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-paper p-3 font-mono text-[11.5px] text-ink-soft">
          {trace.requestText}
        </pre>
      </details>

      <div className="mt-5 rounded-2xl border border-edge bg-surface p-5 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="text-[13.5px] font-semibold text-ink">Timeline</h2>
          <div className="flex items-center gap-3 text-[11px] text-ink-faint">
            {(Object.keys(SPAN_KIND_LABEL) as TraceSpanKind[])
              .filter((k) => spans.some((s) => s.kind === k))
              .map((k) => (
                <span key={k} className="inline-flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${SPAN_STYLE[k].bar}`} />
                  {SPAN_KIND_LABEL[k]}
                </span>
              ))}
          </div>
        </div>

        {spans.length === 0 ? (
          <p className="mt-3 text-[12.5px] text-ink-faint">No timeline data captured for this call.</p>
        ) : (
          <ol className="mt-4 space-y-1.5">
            {spans.map((s) => {
              const leftPct = Math.min(100, (s.startMs / totalMs) * 100);
              const widthPct = Math.max(0.5, Math.min(100 - leftPct, (s.durationMs / totalMs) * 100));
              const style = SPAN_STYLE[s.kind];
              return (
                <li key={s.id}>
                  <details className="group rounded-lg">
                    <summary className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-paper/60">
                      <span className={`w-[168px] shrink-0 truncate text-[12px] font-medium ${style.text}`}>{s.label}</span>
                      <span className="relative h-2 flex-1 rounded-full bg-paper">
                        <span
                          className={`absolute top-0 h-2 rounded-full ${style.bar}`}
                          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                        />
                      </span>
                      <span className="w-14 shrink-0 text-right text-[11.5px] tabular-nums text-ink-faint">
                        {formatMs(s.durationMs)}
                      </span>
                    </summary>
                    {(s.inputText || s.outputText) && (
                      <div className={`ml-2 mt-1.5 rounded-lg ${style.bg} p-3`}>
                        {s.inputText && (
                          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-[11.5px] text-ink-soft">
                            {s.inputText}
                          </pre>
                        )}
                        {s.outputText && (
                          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-[11.5px] text-ink-soft">
                            {s.outputText}
                          </pre>
                        )}
                      </div>
                    )}
                  </details>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10.5px] uppercase tracking-wide text-ink-faint">{label}</p>
      <p className="mt-0.5 truncate font-medium text-ink">{value}</p>
    </div>
  );
}
