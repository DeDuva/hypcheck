"use client";

import { useState, useTransition } from "react";
import { createHypcheckAction, refineAction } from "@/lib/actions";
import type { Cadence, Depth, RefineResult } from "@/lib/types";
import { CADENCE_LABELS, DEPTH_LABELS } from "@/lib/types";

interface MetricDraft {
  name: string;
  description: string;
  weight: number;
}

const DEFAULT_METRICS: MetricDraft[] = [
  { name: "Demand signal", description: "Search volume, community discussion, and inbound interest indicating the target user actively feels this problem.", weight: 5 },
  { name: "Willingness to pay", description: "Evidence of budget: pricing of adjacent tools, procurement chatter, hiring for the workflow.", weight: 4 },
  { name: "Competitive whitespace", description: "How directly incumbents and new entrants cover this exact job-to-be-done.", weight: 4 },
  { name: "Adoption friction", description: "Switching costs, integration burden, and behavior change required to adopt.", weight: 3 },
];

const STEPS = ["Hypothesis", "Metrics", "Cadence & watchlist"];

const inputCls =
  "w-full rounded-lg border border-edge bg-paper/50 px-3 py-2 text-[13.5px] outline-none transition-colors focus:border-iris focus:bg-surface";

export function Wizard() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [statement, setStatement] = useState("");
  const [refine, setRefine] = useState<(RefineResult & { mode: "live" | "heuristic" }) | null>(null);
  const [refining, startRefine] = useTransition();
  const [metrics, setMetrics] = useState<MetricDraft[]>(DEFAULT_METRICS);
  const [cadence, setCadence] = useState<Cadence>("weekly");
  const [depth, setDepth] = useState<Depth>("standard");
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [watchInput, setWatchInput] = useState("");
  const [creating, startCreate] = useTransition();

  const canNext = step === 0 ? name.trim().length > 1 && statement.trim().length > 20 : step === 1 ? metrics.length > 0 : true;

  function handleRefine() {
    startRefine(async () => {
      const result = await refineAction(statement);
      setRefine(result);
      if (result.suggestedMetrics.length) setMetrics(result.suggestedMetrics);
    });
  }

  function addWatch(term: string) {
    const t = term.trim();
    if (t && !watchlist.includes(t)) setWatchlist((w) => [...w, t]);
    setWatchInput("");
  }

  function create() {
    startCreate(async () => {
      await createHypcheckAction({
        name: name.trim(),
        statement: statement.trim(),
        cadence,
        depth,
        watchlist,
        metrics: metrics.map((m) => ({ ...m, name: m.name.trim(), description: m.description.trim() })),
      });
    });
  }

  return (
    <div>
      {/* Stepper */}
      <ol className="flex items-center gap-2">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => i < step && setStep(i)}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                i === step
                  ? "bg-iris text-white"
                  : i < step
                    ? "bg-iris-soft text-iris hover:bg-iris-soft/70"
                    : "bg-surface text-ink-faint ring-1 ring-inset ring-edge"
              }`}
            >
              <span className="tnum">{i + 1}</span>
              {label}
            </button>
            {i < STEPS.length - 1 && <span className="h-px w-6 bg-edge-strong" aria-hidden />}
          </li>
        ))}
      </ol>

      <div className="mt-6 rounded-2xl border border-edge bg-surface p-6 shadow-card">
        {step === 0 && (
          <div className="space-y-5">
            <div>
              <label htmlFor="hc-name" className="text-[12.5px] font-semibold text-ink">
                Name
              </label>
              <p className="mt-0.5 text-[12px] text-ink-faint">A short label for this hypcheck.</p>
              <input
                id="hc-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Momentum — AI meeting-prep copilot"
                className={`mt-1.5 ${inputCls}`}
              />
            </div>
            <div>
              <label htmlFor="hc-statement" className="text-[12.5px] font-semibold text-ink">
                Hypothesis
              </label>
              <p className="mt-0.5 text-[12px] text-ink-faint">
                Who has the problem, why it matters, and what they&apos;d pay to solve it. Make it falsifiable — this
                is what each run tests.
              </p>
              <textarea
                id="hc-statement"
                value={statement}
                onChange={(e) => setStatement(e.target.value)}
                rows={5}
                placeholder="e.g. Enterprise B2B sales teams will pay for an AI copilot that assembles meeting-prep briefs, because AEs waste 3-5 hours a week on manual prep…"
                className={`mt-1.5 ${inputCls} leading-relaxed`}
              />
            </div>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={handleRefine}
                disabled={refining || statement.trim().length < 20}
                className="inline-flex items-center gap-1.5 rounded-lg bg-iris-soft px-3.5 py-2 text-[13px] font-medium text-iris transition-colors hover:bg-iris-soft/70 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {refining ? (
                  <>
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="animate-spin" aria-hidden>
                      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.3" />
                      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    Refining…
                  </>
                ) : (
                  <>
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
                      <path d="M8 1.5l1.7 4.3L14 7.5l-4.3 1.7L8 13.5 6.3 9.2 2 7.5l4.3-1.7L8 1.5z" fill="currentColor" />
                    </svg>
                    Refine with AI
                  </>
                )}
              </button>
            </div>

            {refine && (
              <div className="rounded-xl border border-iris/20 bg-iris-soft/40 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-iris">
                  Critique {refine.mode === "heuristic" && "· structural check (set ANTHROPIC_API_KEY for full AI refinement)"}
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">{refine.critique}</p>
                {refine.refinedStatement.trim() !== statement.trim() && (
                  <>
                    <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-iris">Sharper framing</p>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-ink">{refine.refinedStatement}</p>
                    <button
                      type="button"
                      onClick={() => setStatement(refine.refinedStatement)}
                      className="mt-2.5 rounded-lg bg-iris px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-iris-deep"
                    >
                      Use this framing
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 className="text-[14px] font-semibold">Signal metrics</h2>
            <p className="mt-0.5 text-[12.5px] text-ink-faint">
              Each run scores these 0–100 and combines them (by weight) into the PMF score.
              {refine?.suggestedMetrics.length ? " Pre-filled from the AI refinement — edit freely." : ""}
            </p>
            <div className="mt-4 space-y-3">
              {metrics.map((m, i) => (
                <div key={i} className="rounded-xl border border-edge bg-paper/40 p-3.5">
                  <div className="flex items-center gap-3">
                    <input
                      value={m.name}
                      onChange={(e) => setMetrics((ms) => ms.map((x, xi) => (xi === i ? { ...x, name: e.target.value } : x)))}
                      placeholder="Metric name"
                      className="w-52 rounded-lg border border-edge bg-surface px-2.5 py-1.5 text-[13px] font-medium outline-none focus:border-iris"
                    />
                    <label className="flex items-center gap-2 text-[12px] text-ink-faint">
                      Weight
                      <input
                        type="range"
                        min={1}
                        max={5}
                        value={m.weight}
                        onChange={(e) =>
                          setMetrics((ms) => ms.map((x, xi) => (xi === i ? { ...x, weight: Number(e.target.value) } : x)))
                        }
                        className="accent-iris"
                      />
                      <span className="tnum w-6 font-medium text-ink-soft">{m.weight}/5</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setMetrics((ms) => ms.filter((_, xi) => xi !== i))}
                      className="ml-auto rounded-md p-1 text-ink-faint transition-colors hover:bg-paper hover:text-rose-600"
                      aria-label={`Remove ${m.name}`}
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                  <input
                    value={m.description}
                    onChange={(e) =>
                      setMetrics((ms) => ms.map((x, xi) => (xi === i ? { ...x, description: e.target.value } : x)))
                    }
                    placeholder="What evidence this metric tracks"
                    className="mt-2 w-full rounded-lg border border-edge bg-surface px-2.5 py-1.5 text-[12.5px] text-ink-soft outline-none focus:border-iris"
                  />
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setMetrics((ms) => [...ms, { name: "", description: "", weight: 3 }])}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink-soft ring-1 ring-inset ring-edge transition-colors hover:bg-paper"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              Add metric
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="hc-cadence" className="text-[12.5px] font-semibold text-ink">
                  Run cadence
                </label>
                <p className="mt-0.5 text-[12px] text-ink-faint">How often the market is re-tested.</p>
                <select
                  id="hc-cadence"
                  value={cadence}
                  onChange={(e) => setCadence(e.target.value as Cadence)}
                  className={`mt-1.5 ${inputCls}`}
                >
                  {(Object.keys(CADENCE_LABELS) as Cadence[]).map((c) => (
                    <option key={c} value={c}>
                      {CADENCE_LABELS[c]}
                      {c === "weekly" ? " (recommended)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="hc-depth" className="text-[12.5px] font-semibold text-ink">
                  Research depth
                </label>
                <p className="mt-0.5 text-[12px] text-ink-faint">Length and depth of each report.</p>
                <select
                  id="hc-depth"
                  value={depth}
                  onChange={(e) => setDepth(e.target.value as Depth)}
                  className={`mt-1.5 ${inputCls}`}
                >
                  {(Object.keys(DEPTH_LABELS) as Depth[]).map((d) => (
                    <option key={d} value={d}>
                      {DEPTH_LABELS[d]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="hc-watch" className="text-[12.5px] font-semibold text-ink">
                Watchlist
              </label>
              <p className="mt-0.5 text-[12px] text-ink-faint">
                Companies, products, or competitive signals checked in every run. Press Enter to add.
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-lg border border-edge bg-paper/50 px-2 py-1.5 focus-within:border-iris focus-within:bg-surface">
                {watchlist.map((w) => (
                  <span
                    key={w}
                    className="inline-flex items-center gap-1 rounded-full bg-iris-soft px-2.5 py-1 text-[12px] font-medium text-iris"
                  >
                    {w}
                    <button
                      type="button"
                      onClick={() => setWatchlist((ws) => ws.filter((x) => x !== w))}
                      aria-label={`Remove ${w}`}
                      className="transition-colors hover:text-iris-deep"
                    >
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden>
                        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </button>
                  </span>
                ))}
                <input
                  id="hc-watch"
                  value={watchInput}
                  onChange={(e) => setWatchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addWatch(watchInput);
                    }
                  }}
                  placeholder={watchlist.length ? "" : "e.g. Gong, Clari, Salesforce Einstein Copilot"}
                  className="min-w-[180px] flex-1 bg-transparent px-1.5 py-0.5 text-[13px] outline-none"
                />
              </div>
              {refine?.suggestedWatchlist.filter((s) => !watchlist.includes(s)).length ? (
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11.5px] text-ink-faint">Suggested:</span>
                  {refine.suggestedWatchlist
                    .filter((s) => !watchlist.includes(s))
                    .map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => addWatch(s)}
                        className="rounded-full bg-surface px-2.5 py-1 text-[12px] font-medium text-ink-soft ring-1 ring-inset ring-edge transition-colors hover:bg-iris-soft hover:text-iris"
                      >
                        + {s}
                      </button>
                    ))}
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-edge bg-paper/50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Summary</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink">{statement}</p>
              <p className="mt-2 text-[12px] text-ink-faint">
                {CADENCE_LABELS[cadence]} · {DEPTH_LABELS[depth]} · {metrics.length} metrics ·{" "}
                {watchlist.length ? `watching ${watchlist.join(", ")}` : "no watchlist"}
              </p>
            </div>
          </div>
        )}

        {/* Footer nav */}
        <div className="mt-6 flex items-center justify-between border-t border-edge pt-4">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || creating}
            className="rounded-lg px-3 py-2 text-[13px] font-medium text-ink-faint transition-colors hover:text-ink disabled:invisible"
          >
            ← Back
          </button>
          {step < 2 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              disabled={!canNext}
              className="rounded-lg bg-iris px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-iris-deep disabled:cursor-not-allowed disabled:opacity-40"
            >
              Continue →
            </button>
          ) : (
            <button
              type="button"
              onClick={create}
              disabled={creating}
              className="inline-flex items-center gap-2 rounded-lg bg-iris px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-iris-deep disabled:cursor-wait disabled:opacity-60"
            >
              {creating ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="animate-spin" aria-hidden>
                    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.3" />
                    <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  Creating &amp; running first check…
                </>
              ) : (
                "Create hypcheck"
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
