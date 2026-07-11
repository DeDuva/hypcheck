import Link from "next/link";
import type { Trace, TraceSpan, TraceSpanKind } from "@/lib/types";
import { formatDateTime, formatMs } from "@/lib/format";

export const STATUS_STYLE: Record<string, string> = {
  ok: "bg-emerald-50 text-emerald-700",
  error: "bg-rose-50 text-rose-700",
  running: "bg-amber-50 text-amber-700",
};

export const KIND_LABEL: Record<string, string> = {
  research: "Research run",
  refine: "Hypothesis refine",
};

// Fixed categorical order, validated for CVD separation with scripts/validate_palette.js
// ("#4f46e5,#0d9488,#d97706,#e11d48" — all checks pass). "thinking" reuses the app's
// existing --color-iris token; the others are never reused for anything else here.
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10.5px] uppercase tracking-wide text-ink-faint">{label}</p>
      <p className="mt-0.5 truncate font-medium text-ink">{value}</p>
    </div>
  );
}

/** Header, stats, request prompt, and waterfall timeline for one trace. Callers own the page shell/breadcrumb. */
export function TraceDetailBody({
  trace,
  spans,
  hypcheckLink,
}: {
  trace: Trace;
  spans: TraceSpan[];
  hypcheckLink?: { name: string; href: string };
}) {
  const totalMs = trace.durationMs ?? Math.max(1, ...spans.map((s) => s.startMs + s.durationMs));

  return (
    <>
      <div className="mt-2 flex items-center gap-2.5">
        <h1 className="text-[20px] font-semibold tracking-tight">{KIND_LABEL[trace.kind] ?? trace.kind}</h1>
        <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-medium ${STATUS_STYLE[trace.status] ?? "bg-paper text-ink-faint"}`}>
          {trace.status}
        </span>
      </div>
      {hypcheckLink && (
        <p className="mt-1 text-[12.5px] text-ink-faint">
          <Link href={hypcheckLink.href} className="text-iris hover:text-iris-deep">
            {hypcheckLink.name}
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
    </>
  );
}

/** Trace list table. Pass `hypcheckNames` to show the Hypcheck column (global admin view); omit it for a view already scoped to one hypcheck. */
export function TraceTable({
  traces,
  traceHref,
  hypcheckNames,
}: {
  traces: Trace[];
  traceHref: (id: string) => string;
  hypcheckNames?: Map<string, string>;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-edge bg-surface shadow-card">
      <table className="w-full text-left text-[12.5px]">
        <thead>
          <tr className="border-b border-edge text-[11px] uppercase tracking-wide text-ink-faint">
            <th className="px-4 py-2.5 font-medium">Started</th>
            {hypcheckNames && <th className="px-4 py-2.5 font-medium">Hypcheck</th>}
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
                <Link href={traceHref(t.id)} className="text-iris hover:text-iris-deep">
                  {formatDateTime(t.startedAt)}
                </Link>
              </td>
              {hypcheckNames && (
                <td className="max-w-[160px] truncate px-4 py-2.5 text-ink-soft">
                  {t.hypcheckId ? (hypcheckNames.get(t.hypcheckId) ?? t.hypcheckId) : <span className="text-ink-faint">—</span>}
                </td>
              )}
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
              <td colSpan={hypcheckNames ? 8 : 7} className="px-4 py-8 text-center text-ink-faint">
                No API calls recorded yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
