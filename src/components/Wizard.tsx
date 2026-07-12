"use client";

import { useState, useTransition } from "react";
import { createHypcheckAction, refineAction } from "@/lib/actions";
import type { Cadence, Depth, RefineResult, WatchlistCategory, WatchlistEntry } from "@/lib/types";
import { CADENCE_LABELS, DEPTH_LABELS, WATCHLIST_CATEGORY_LABELS } from "@/lib/types";

interface MetricDraft {
  name: string;
  description: string;
  weight: number;
  signals: string; // the concrete public evidence a run should look for
  direction: string; // what score-up vs score-down looks like
  vetted?: boolean; // came from the AI refinement, which validated external observability
}

const DEFAULT_METRICS: MetricDraft[] = [
  {
    name: "Demand signal",
    description: "Search volume, community discussion, and inbound interest indicating the target user actively feels this problem.",
    weight: 5,
    signals: "Search-trend movement, new community threads on the pain point, practitioner posts describing the workaround.",
    direction: "Up: rising search/community volume on the problem. Down: discussion fades or shifts to an incumbent.",
  },
  {
    name: "Willingness to pay",
    description: "Evidence of budget: pricing of adjacent tools, procurement chatter, hiring for the workflow.",
    weight: 4,
    signals: "Pricing-page changes at adjacent tools, funding rounds in the category, job postings that own this workflow.",
    direction: "Up: adjacent tools raise prices or new paid entrants appear. Down: category tools go freemium or get bundled.",
  },
  {
    name: "Competitive whitespace",
    description: "How directly incumbents and new entrants cover this exact job-to-be-done.",
    weight: 4,
    signals: "Launch posts, changelogs, and feature announcements from incumbents and new entrants targeting the same job.",
    direction: "Up: the specific job stays unserved. Down: a credible player ships direct coverage of it.",
  },
  {
    name: "Adoption friction",
    description: "Switching costs, integration burden, and behavior change required to adopt.",
    weight: 3,
    signals: "New integrations/APIs in the ecosystem, platform policy changes, public complaints about switching costs.",
    direction: "Up: ecosystem changes lower the barrier to adopt. Down: lock-in or new compliance hurdles raise it.",
  },
];

// Hypchecks only see public web signals — flag hand-written metrics that would
// need internal data, since no run will ever be able to observe them.
const INTERNAL_DATA_RE =
  /\b(revenue|arr|mrr|churn|nps|csat|pipeline|bookings|quota|win rates?|closed deals?|deal flow|sales calls?|customer (calls?|interviews?)|retention|conversion rates?|active users|dau|mau|wau)\b/i;

function looksInternal(m: MetricDraft): boolean {
  return INTERNAL_DATA_RE.test(`${m.name} ${m.description} ${m.signals}`);
}

const STEPS = ["Hypothesis", "Metrics", "Cadence & watchlist"];

// Suggestions are shown grouped in this order, matching the mix the AI is
// briefed to research (competitors first, then platform risk, then signals).
const WATCHLIST_CATEGORY_ORDER: WatchlistCategory[] = ["competitor", "platform_threat", "signal"];

const inputCls =
  "w-full rounded-lg border border-edge bg-paper/50 px-3 py-2 text-[13.5px] outline-none transition-colors focus:border-iris focus:bg-surface";

export function Wizard() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [statement, setStatement] = useState("");
  const [refine, setRefine] = useState<(RefineResult & { mode: "live" | "heuristic" }) | null>(null);
  const [refining, startRefine] = useTransition();
  const [answers, setAnswers] = useState<string[]>([]);
  const [answeredRound, setAnsweredRound] = useState(false); // one clarifying round max
  const [metrics, setMetrics] = useState<MetricDraft[]>(DEFAULT_METRICS);
  const [cadence, setCadence] = useState<Cadence>("weekly");
  const [depth, setDepth] = useState<Depth>("standard");
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
  const [watchInput, setWatchInput] = useState("");
  const [editingWatch, setEditingWatch] = useState<number | null>(null);
  const [creating, startCreate] = useTransition();

  const canNext = step === 0 ? name.trim().length > 1 && statement.trim().length > 20 : step === 1 ? metrics.length > 0 : true;

  function handleRefine(withAnswers = false) {
    const answerPayload =
      withAnswers && refine
        ? refine.clarifyingQuestions.map((q, i) => ({ question: q, answer: answers[i] ?? "" })).filter((a) => a.answer.trim())
        : [];
    if (withAnswers) setAnsweredRound(true);
    startRefine(async () => {
      const result = await refineAction(statement, answerPayload);
      setRefine(result);
      setAnswers([]);
      if (result.suggestedMetrics.length) setMetrics(result.suggestedMetrics.map((m) => ({ ...m, vetted: true })));
    });
  }

  function addWatch(entry: WatchlistEntry) {
    const name = entry.name.trim();
    if (name && !watchlist.some((w) => w.name.toLowerCase() === name.toLowerCase())) {
      setWatchlist((w) => [...w, { name, reason: entry.reason, category: entry.category }]);
    }
    setWatchInput("");
  }

  function setWatchReason(i: number, reason: string) {
    setWatchlist((ws) => ws.map((w, wi) => (wi === i ? { ...w, reason } : w)));
  }

  function create() {
    startCreate(async () => {
      await createHypcheckAction({
        name: name.trim(),
        statement: statement.trim(),
        cadence,
        depth,
        watchlist,
        metrics: metrics.map(({ vetted: _vetted, ...m }) => ({
          ...m,
          name: m.name.trim(),
          description: m.description.trim(),
          signals: m.signals.trim(),
          direction: m.direction.trim(),
        })),
        refinement: refine ? { critique: refine.critique, rubric: refine.rubric } : null,
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
                onClick={() => handleRefine()}
                disabled={refining || statement.trim().length < 20}
                className="inline-flex items-center gap-1.5 rounded-lg bg-iris-soft px-3.5 py-2 text-[13px] font-medium text-iris transition-colors hover:bg-iris-soft/70 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {refining ? (
                  <>
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="animate-spin" aria-hidden>
                      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.3" />
                      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    Researching the market…
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
              {refining && (
                <span className="text-[11.5px] text-ink-faint">
                  Grounding the critique in current market research — up to a minute or two.
                </span>
              )}
            </div>

            {refine && !refining && (
              <div className="rounded-xl border border-iris/20 bg-iris-soft/40 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-iris">
                  Critique {refine.mode === "heuristic" && "· structural check (set ANTHROPIC_API_KEY for full AI refinement)"}
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">{refine.critique}</p>

                {refine.rubric.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {refine.rubric.map((check) => (
                      <li key={check.criterion} className="flex items-start gap-2 text-[12.5px]">
                        <span className={check.pass ? "text-band-strong" : "text-stance-hold"} aria-hidden>
                          {check.pass ? "✓" : "✗"}
                        </span>
                        <span>
                          <span className="font-medium text-ink">{check.criterion}</span>
                          {!check.pass && check.fix && <span className="text-ink-faint"> — {check.fix}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {refine.refinedStatement.trim() !== statement.trim() && (
                  <>
                    <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-iris">Sharper framing</p>
                    <p className="mt-1.5 font-serif text-[14px] italic leading-relaxed text-ink">{refine.refinedStatement}</p>
                    <button
                      type="button"
                      onClick={() => setStatement(refine.refinedStatement)}
                      className="mt-2.5 rounded-lg bg-iris px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-iris-deep"
                    >
                      Use this framing
                    </button>
                  </>
                )}

                {refine.clarifyingQuestions.length > 0 && !answeredRound && (
                  <div className="mt-4 border-t border-iris/15 pt-3.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-iris">
                      The advisor needs your call on {refine.clarifyingQuestions.length === 1 ? "one thing" : "a couple of things"}
                    </p>
                    <div className="mt-2 space-y-2.5">
                      {refine.clarifyingQuestions.map((q, i) => (
                        <div key={q}>
                          <p className="text-[12.5px] leading-relaxed text-ink">{q}</p>
                          <input
                            value={answers[i] ?? ""}
                            onChange={(e) =>
                              setAnswers((a) => {
                                const next = [...a];
                                next[i] = e.target.value;
                                return next;
                              })
                            }
                            placeholder="Your answer"
                            className="mt-1 w-full rounded-lg border border-edge bg-surface px-2.5 py-1.5 text-[12.5px] outline-none focus:border-iris"
                          />
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRefine(true)}
                      disabled={!answers.some((a) => a?.trim())}
                      className="mt-2.5 rounded-lg bg-iris-soft px-3 py-1.5 text-[12px] font-medium text-iris ring-1 ring-inset ring-iris/20 transition-colors hover:bg-iris-soft/70 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Refine again with my answers
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 className="text-[14px] font-semibold">Signal metrics</h2>
            <p className="mt-0.5 text-[12.5px] text-ink-faint">
              Each run scores these 0–100 from public web signals only and combines them (by weight) into the PMF score.
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
                    {m.vetted && !looksInternal(m) && (
                      <span className="shrink-0 rounded-full bg-band-strong-tint px-2 py-0.5 text-[10.5px] font-medium text-band-strong">
                        external signal
                      </span>
                    )}
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
                      className="ml-auto rounded-md p-1 text-ink-faint transition-colors hover:bg-paper hover:text-band-weak"
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
                  <input
                    value={m.signals}
                    onChange={(e) => setMetrics((ms) => ms.map((x, xi) => (xi === i ? { ...x, signals: e.target.value } : x)))}
                    placeholder="Public evidence to look for — e.g. funding news, launches, pricing changes, job postings"
                    className="mt-1.5 w-full rounded-lg border border-edge bg-surface px-2.5 py-1.5 text-[12.5px] text-ink-soft outline-none focus:border-iris"
                  />
                  <input
                    value={m.direction}
                    onChange={(e) => setMetrics((ms) => ms.map((x, xi) => (xi === i ? { ...x, direction: e.target.value } : x)))}
                    placeholder="What moves it — e.g. up: new entrants raise; down: incumbent bundles it free"
                    className="mt-1.5 w-full rounded-lg border border-edge bg-surface px-2.5 py-1.5 text-[12.5px] text-ink-soft outline-none focus:border-iris"
                  />
                  {looksInternal(m) && (
                    <p className="mt-1.5 text-[11.5px] text-stance-hold">
                      Looks like this needs internal data — no run can observe it from public sources. Reframe it around a
                      public proxy (pricing, hiring, launches, search volume).
                    </p>
                  )}
                </div>
              ))}
            </div>
            {refine?.rejectedMetrics?.length ? (
              <p className="mt-3 text-[11.5px] leading-relaxed text-ink-faint">
                Not suggested (can’t be observed from public sources at cadence):{" "}
                {refine.rejectedMetrics.map((r) => `${r.name} — ${r.reason.replace(/\.$/, "")}`).join(" · ")}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => setMetrics((ms) => [...ms, { name: "", description: "", weight: 3, signals: "", direction: "" }])}
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
                Companies, products, or competitive signals checked in every run — each one carries a reason, which
                is what makes a future check specific instead of generic.
              </p>

              {watchlist.length > 0 && (
                <div className="mt-1.5 divide-y divide-edge rounded-lg border border-edge bg-paper/40">
                  {watchlist.map((w, i) => (
                    <div key={w.name} className="flex items-start justify-between gap-3 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-ink">{w.name}</p>
                        {editingWatch === i ? (
                          <input
                            autoFocus
                            defaultValue={w.reason}
                            placeholder="Why watch this?"
                            onBlur={(e) => {
                              setWatchReason(i, e.target.value.trim());
                              setEditingWatch(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.currentTarget.blur();
                              if (e.key === "Escape") setEditingWatch(null);
                            }}
                            className="mt-1 w-full rounded-md border border-iris bg-surface px-2 py-1 text-[12px] outline-none"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setEditingWatch(i)}
                            className="mt-0.5 block text-left text-[12px] leading-relaxed text-ink-faint transition-colors hover:text-iris"
                          >
                            {w.reason || "+ Add reason"}
                          </button>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2 pt-0.5">
                        {w.category && (
                          <span className="rounded-full bg-iris-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-iris">
                            {WATCHLIST_CATEGORY_LABELS[w.category]}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => setWatchlist((ws) => ws.filter((_, wi) => wi !== i))}
                          aria-label={`Remove ${w.name}`}
                          className="rounded-md p-1 text-ink-faint transition-colors hover:bg-paper hover:text-band-weak"
                        >
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
                            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <input
                id="hc-watch"
                value={watchInput}
                onChange={(e) => setWatchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addWatch({ name: watchInput, reason: "" });
                  }
                }}
                placeholder="e.g. Gong, Clari, Salesforce Einstein Copilot — press Enter to add"
                className={`mt-1.5 ${inputCls}`}
              />

              {refine?.suggestedWatchlist.filter((s) => !watchlist.some((w) => w.name.toLowerCase() === s.name.toLowerCase())).length ? (
                <div className="mt-3.5 space-y-3 border-t border-edge pt-3.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                    Suggested from your research
                  </p>
                  {WATCHLIST_CATEGORY_ORDER.map((cat) => {
                    const items = refine.suggestedWatchlist.filter(
                      (s) => (s.category ?? "signal") === cat && !watchlist.some((w) => w.name.toLowerCase() === s.name.toLowerCase())
                    );
                    if (!items.length) return null;
                    return (
                      <div key={cat}>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                          {WATCHLIST_CATEGORY_LABELS[cat]}
                        </span>
                        <div className="mt-1.5 divide-y divide-edge rounded-lg border border-edge">
                          {items.map((s) => (
                            <div key={s.name} className="flex items-start justify-between gap-3 px-3 py-2">
                              <div className="min-w-0">
                                <p className="text-[12.5px] font-medium text-ink">{s.name}</p>
                                <p className="mt-0.5 text-[12px] leading-relaxed text-ink-faint">{s.reason}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => addWatch(s)}
                                className="shrink-0 rounded-md bg-iris-soft px-2.5 py-1 text-[11.5px] font-medium text-iris transition-colors hover:bg-iris hover:text-white"
                              >
                                + Add
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-edge bg-paper/50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Summary</p>
              <p className="mt-1.5 font-serif text-[14px] italic leading-relaxed text-ink">{statement}</p>
              <p className="mt-2 text-[12px] text-ink-faint">
                {CADENCE_LABELS[cadence]} · {DEPTH_LABELS[depth]} · {metrics.length} metrics ·{" "}
                {watchlist.length ? `watching ${watchlist.map((w) => w.name).join(", ")}` : "no watchlist"}
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
