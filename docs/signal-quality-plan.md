# Signal Quality Plan

**Status: phases 1 (freshness discipline + carry-forward) and 2 (external-only metric model) implemented; phases 3–4 not started.** As each phase ships, mark it here and add/update the corresponding line in the README's "Signal quality" section.

> Note: "phase" numbers in this doc are the signal-quality track. They are unrelated to the access-control phases (auth wall / roles / sharing) already referenced in the README.

## Why

Learnings from real usage:

1. **A great initial hypothesis is everything.** Today's "Refine with AI" is a single ungrounded call — no web research, no iteration, no questions back to the author.
2. **The metrics make or break the hypcheck's value over time.** Nothing today constrains metrics to signals a run can actually observe.
3. **Runs incorporate outdated information.** Stale evidence currently moves the PMF score just as much as this week's news.

**Product posture shift:** the PM gives directional intent; Hypcheck acts as a talented, research-grounded thought leader who authors the sharpest version of the hypothesis, designs the measurement plan, and stress-tests it every run. Once the hypothesis is set, every run answers one question: **"what's changing around me?"**

**Hard constraint — external signals only.** No hypcheck has access to internal data. Metrics must be assessable purely from public web sources: press releases, funding news, product launches, pricing pages, job postings, search/community trends, analyst coverage. Anything requiring internal data (revenue, pipeline, deals, customer calls, NPS, churn) is banned *unless it's the kind of thing that would appear in a press release*.

## Product principles (apply to every phase)

The bar is a **beautiful, easy product — not a more complicated one**. Concretely:

- **No new pages, no new steps.** The wizard stays 3 steps; all improvements live inside existing surfaces.
- **One concept per feature in the UI.** Freshness surfaces as exactly one user-visible idea — a metric either has a *fresh signal* or is *carried forward*. The internal taxonomy never leaks into the UI.
- **The AI proposes, the user taps.** Every suggestion (rewrite, metric, watchlist entry, watchlist change) is accepted or dismissed with one click, in the pattern the insights feed already uses.
- **Quiet failures.** Rejected/invalid metrics get one muted line of explanation, not a modal or an error state.
- **Fewer, better defaults.** Prefer removing an input over adding a toggle. No new settings unless a phase note explicitly calls for one.

## Decisions already made

- **Carry-forward on no-fresh-signal**: when a metric (or a whole run) has no fresh evidence, the prior score is carried forward and the point/chip is visibly flagged "carried forward". The chart stays continuous; "nothing changed" is itself the answer to "what's changing around me".
- **PMF score is computed deterministically** in code as the freshness-gated weighted average of metric scores — the model's own overall number is kept only as a logged sanity check. Stale evidence *cannot* leak into the score.
- **External-only metrics** enforced in prompt + validator + UI (see hard constraint above).

---

## Phase 1 — Freshness discipline + carry-forward (runs)

*Fixes runs for existing hypchecks immediately; no creation-flow dependency. Ship first.*

**Prompt ([src/lib/engine/claude.ts](../src/lib/engine/claude.ts), `liveRun`)**
- Define a freshness window from cadence: primary window = since the last run (first run: 2× cadence), background = 90 days. Only evidence inside the window may move a metric score; older material is context only. Search queries must be recency-scoped.
- Schema additions: each `sources[]` entry gains `publishedAt` (ISO or null); each `metricScores[]` entry gains `freshness: "fresh" | "stale" | "none"` (age of the *newest* evidence supporting the score).

**Enforcement in code (never trust the prompt alone)**
- Post-process in `liveRun`: a metric with `freshness` ≠ `fresh` is carried forward from the prior run's score for that metric (run 1: excluded from weighting). Compute `pmfScore` as the weighted average of fresh + carried scores; mechanically reduce `confidence` as the fresh fraction drops. Log the model's own pmfScore for comparison.
- `MetricScore` gains `carriedForward: boolean` ([src/lib/types.ts](../src/lib/types.ts)); `Run` needs no new columns beyond what `metricScores` JSON already stores.

**Richer prior context — the "what changed" engine**
- Replace the one-line `priorContext` in [src/lib/engine/index.ts](../src/lib/engine/index.ts) with a structured digest: prior per-metric scores + notes, prior stance, open insights.
- Add `changesSinceLastRun: string` to the run schema; the exec summary leads with deltas.

**UX (keep it to one idea)**
- Metric table + ScoreChip: a small "carried forward" tag on carried metrics; nothing else changes visually.
- Report ([src/lib/engine/report.ts](../src/lib/engine/report.ts)): "What changed since <date>" block near the top; one line "Evidence: N of M sources from the last X days"; stale sources listed under "Background".
- PmfChart: carried-forward points rendered hollow/dimmed with a tooltip note.

**Parity:** update [src/lib/engine/simulate.ts](../src/lib/engine/simulate.ts) and [scripts/probe-engine.ts](../scripts/probe-engine.ts) for the new fields.

**First-run note:** the first run after this ships will re-base scores (deterministic weighting replaces model judgment). Add a one-line method note to that report so the trend break is explainable.

## Phase 2 — External-only metric model

*Schema groundwork that the studio (phase 3) and runs both consume.*

**Model ([src/lib/types.ts](../src/lib/types.ts), [src/lib/store.ts](../src/lib/store.ts))** — `Metric` gains:
- `signals: string` — the concrete public evidence to look for.
- `direction: string` — what a score-up vs. score-down observation looks like, so week-over-week scoring is consistent.
- DB migration with back-compat defaults (empty strings) for existing metrics.

**Enforcement, three layers**
1. Refine + run prompts state the external-only constraint verbatim (see hard constraint above).
2. Refine schema: each suggested metric carries `externallyObservable: boolean` and an update-frequency check ("does fresh evidence realistically appear at this cadence?"). Failing metrics are returned in a `rejected` list with one-line reasons.
3. Wizard metrics step: a subtle "external · updates weekly" badge per metric; hand-written metrics that look internal (keyword heuristic: revenue, ARR, churn, deals, NPS, pipeline, calls…) get one muted inline warning: *"No run will be able to observe this — it needs internal data."* Non-blocking.

**Defaults:** replace `DEFAULT_METRICS` in [src/components/Wizard.tsx](../src/components/Wizard.tsx) with external-only framings and populated `signals`/`direction`.

## Phase 3 — Grounded Hypothesis Studio + watchlist with intent

*One grounded refine call feeds both. The biggest UX moment — keep it calm.*

**Engine ([src/lib/engine/claude.ts](../src/lib/engine/claude.ts))**
- `liveRefineGrounded()`: the refine call gets the `web_search` tool (budget 3–5 searches) so critique, rewrite, metrics, and watchlist reflect the *current* market, not training-data priors. Reuse the run engine's streaming/timeout patterns.
- Quality rubric in the schema — five pass/fail checks with a one-line fix each: named target segment · falsifiable claim · externally observable evidence · time-bound/testable · differentiated vs. named incumbents.
- `clarifyingQuestions: string[]` (0–2 max): asked only when research can't resolve an ambiguity in the author's directional intent.
- One optional second round: `refineAction` accepts prior critique + user answers. **Cap at one clarifying round** — converge, don't chat.

**Watchlist model**
- `watchlist: string[]` → `{ name: string; reason: string }[]` (migration wraps existing strings; read back-compat in store). The reason ("closest incumbent for the same JTBD", "platform absorption threat") is what makes run-time checks targeted.
- Grounded refine proposes verified, currently-operating entities with reasons; aim for a mix: 2–3 direct competitors, 1–2 platform threats, 1 leading-indicator signal.
- Runs may propose `watchlistChanges` (add with reason / remove with reason), surfaced in the insights feed with the same Accept/Dismiss pattern.

**Wizard UX ([src/components/Wizard.tsx](../src/components/Wizard.tsx)) — still 3 steps**
- Step 1's refine panel becomes: rubric as five checkmarks → clarifying questions (inline inputs) → "Refine again with my answers" → "Use this framing". A streaming progress state covers the 30–90s grounded call.
- Watchlist chips show the reason on hover; suggested chips carry it from the refine result.
- Persist the final critique/rubric with the hypcheck (new column), shown on the settings page as the standing definition of what "testing this hypothesis" means.

**Fallback:** keep `heuristicRefine` for the no-API-key path; it fills the new fields with sensible static content.

## Phase 4 — Thought-leader run posture

*Cheap once phase 1's prior-context digest exists. Mostly prompt + report polish.*

- Rewrite the run persona from "market researcher" to *"the strategy advisor who authored this hypothesis, now actively stress-testing it."* Each run must: (a) state what changed, (b) name the single strongest piece of fresh evidence **for** and **against**, (c) explicitly say whether this week's evidence warrants a revision — flowing through the existing `proposedRevision` → Accept/Dismiss path.
- Report: the for/against pair rendered as a compact two-column callout; no new sections beyond that.
- Final pass over simulate.ts / probe-engine.ts parity and the README.

---

## Cross-cutting notes

- **One branch + PR per phase** (repo workflow: never push straight to main).
- **README:** add a short "Signal quality" section on phase 1's PR; extend it one line per phase as each ships. Update this doc's status header in the same PR.
- **Cost/latency:** grounded refine adds ~30–90s + search cost at creation — mitigated by streaming progress and the capped search budget. Runs stay within the existing depth/search budgets.
- **Verification per phase:** run `scripts/probe-engine.ts` against a live key, plus one end-to-end hypcheck creation + manual run in the preview; check `/api/health` telemetry for the deterministic-vs-model score comparison (phase 1).
