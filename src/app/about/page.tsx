import Link from "next/link";
import type { Metadata } from "next";
import { BAND_COLORS, STANCE_COLORS, ScoreChip, StanceBadge, ModeBadge } from "@/components/ScoreChip";
import { VerdictStamp } from "@/components/VerdictStamp";
import { DeltaBadge } from "@/components/DeltaBadge";
import { DiffView } from "@/components/DiffView";
import { ThemeToggle } from "@/components/ThemeToggle";
import { STANCE_LABELS, STANCE_BLURB, scoreBand, type AnalystStance } from "@/lib/types";

export const metadata: Metadata = {
  title: "Hypcheck — Design system",
  description: "The visual language behind Hypcheck: an analyst's field ledger for testing whether a product hypothesis is gaining or losing product-market fit.",
};

// Representative scores chosen to land one tick inside each band, so the
// gallery below reads the same way a real dashboard card would.
const BAND_SAMPLES = [28, 47, 61, 82];
const STANCE_KEYS: AnalystStance[] = ["accelerate", "advance", "hold", "reposition", "retreat"];

function SectionHeading({ eyebrow, title, blurb }: { eyebrow: string; title: string; blurb: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-label font-semibold uppercase tracking-[0.1em] text-ink-faint">{eyebrow}</p>
      <h2 className="mt-1 text-[19px] font-semibold tracking-tight text-ink">{title}</h2>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">{blurb}</p>
    </div>
  );
}

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-12 lg:px-8">
      {/* Masthead */}
      <div className="flex items-start justify-between gap-4">
        <Link href="/" className="inline-flex items-center gap-2 text-[12.5px] font-medium text-ink-faint transition-colors hover:text-ink">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M10 3.5L5 8l5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to the app
        </Link>
        <ThemeToggle />
      </div>

      <header className="mt-6">
        <p className="text-label font-semibold uppercase tracking-[0.1em] text-ink-faint">Design system</p>
        <h1 className="text-balance mt-2 font-serif text-display italic tracking-tight text-ink">
          The analyst&rsquo;s field ledger
        </h1>
        <p className="mt-4 max-w-2xl text-body leading-relaxed text-ink-soft">
          Hypcheck exists to stress-test a claim against evidence, on a schedule, without asking anyone their
          opinion. Every choice below tries to dramatize that premise: a hypothesis is a written claim, a PMF score
          is a verdict stamped onto it, and a revision is a copy-edited correction — not a chat bubble. This page is
          the system that follows from that idea, kept as a living page rather than a static deck so it can&rsquo;t
          drift from what actually ships.
        </p>
      </header>

      {/* Type */}
      <section className="mt-16">
        <SectionHeading
          eyebrow="01 — Typography"
          title="A serif claim, a sans instrument, a mono reading"
          blurb="Three faces doing three different jobs, never interchangeably: Newsreader sets the hypothesis itself — the thing under test — in italics, like a quoted claim. Geist Sans runs the console: labels, nav, buttons. Geist Mono is reserved for anything that's a measurement — scores, dates, token counts — so a number always looks like data, not prose."
        />
        <div className="mt-6 divide-y divide-edge rounded-2xl border border-edge bg-surface shadow-card">
          <div className="flex items-baseline justify-between gap-6 px-6 py-5">
            <span className="font-serif text-display italic leading-none text-ink">Claim</span>
            <span className="shrink-0 text-caption text-ink-faint">display · 2.75rem · Newsreader italic</span>
          </div>
          <div className="flex items-baseline justify-between gap-6 px-6 py-5">
            <span className="font-serif text-headline italic leading-none text-ink">Enterprise AEs will pay</span>
            <span className="shrink-0 text-caption text-ink-faint">headline · 1.85rem · Newsreader italic</span>
          </div>
          <div className="flex items-baseline justify-between gap-6 px-6 py-5">
            <span className="text-subhead font-semibold leading-none text-ink">Current PMF score</span>
            <span className="shrink-0 text-caption text-ink-faint">subhead · 1.125rem · Geist Sans</span>
          </div>
          <div className="flex items-baseline justify-between gap-6 px-6 py-5">
            <span className="text-body leading-none text-ink-soft">Longitudinal signal across your hypotheses.</span>
            <span className="shrink-0 text-caption text-ink-faint">body · 0.9375rem · Geist Sans</span>
          </div>
          <div className="flex items-baseline justify-between gap-6 px-6 py-5">
            <span className="tnum font-mono text-data leading-none text-ink">71 · Jul 4, 2026 · 12 runs</span>
            <span className="shrink-0 text-caption text-ink-faint">data · 0.8125rem · Geist Mono</span>
          </div>
          <div className="flex items-baseline justify-between gap-6 px-6 py-5">
            <span className="text-label font-semibold uppercase leading-none tracking-[0.08em] text-ink-faint">Strong signal</span>
            <span className="shrink-0 text-caption text-ink-faint">label · 0.6875rem · Geist Sans</span>
          </div>
        </div>
      </section>

      {/* Verdict bands */}
      <section className="mt-16">
        <SectionHeading
          eyebrow="02 — Verdict bands"
          title="How strong is the signal"
          blurb="Forest, slate teal, brass, and brick — hand-tuned instead of Tailwind's default emerald/teal/amber/rose, and deliberately not reused anywhere else. This is the one scale that answers exactly one question: is the evidence holding up?"
        />
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(["strong", "promising", "emerging", "weak"] as const).map((key) => (
            <div key={key} className="rounded-xl border border-edge bg-surface p-4 shadow-card">
              <span className={`block h-8 w-8 rounded-full ${BAND_COLORS[key].dot}`} />
              <p className={`mt-3 text-[13px] font-semibold capitalize ${BAND_COLORS[key].text}`}>{key}</p>
              <p className="mt-0.5 text-caption text-ink-faint">
                {key === "strong" ? "≥ 70" : key === "promising" ? "55–69" : key === "emerging" ? "40–54" : "< 40"}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Analyst stance */}
      <section className="mt-16">
        <SectionHeading
          eyebrow="03 — Analyst&rsquo;s call"
          title="What to do about it"
          blurb="A five-step diverging dial, a completely different hue family from the bands above — because 'how strong is the signal' and 'what should you do about it' are different axes and answering one shouldn't visually imply the other."
        />
        <div className="mt-6 space-y-2">
          {STANCE_KEYS.map((key) => (
            <div key={key} className="flex items-center gap-4 rounded-xl border border-edge bg-surface px-4 py-3 shadow-card">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${STANCE_COLORS[key].dot}`} />
              <span className={`w-24 shrink-0 text-[13px] font-semibold ${STANCE_COLORS[key].text}`}>
                {STANCE_LABELS[key]}
              </span>
              <span className="text-[12.5px] leading-relaxed text-ink-soft">{STANCE_BLURB[key]}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Verdict stamp */}
      <section className="mt-16">
        <SectionHeading
          eyebrow="04 — The verdict stamp"
          title="A measurement instrument, not a badge"
          blurb="The hero score treatment — a caliper-ring mark rather than a pill or a gauge, because the product's whole idea is a periodic reading, not a one-time grade. Same component at every size, from a table row to a report header."
        />
        <div className="mt-6 flex flex-wrap items-end gap-8 rounded-2xl border border-edge bg-surface p-6 shadow-card">
          {BAND_SAMPLES.map((score) => (
            <div key={score} className="flex flex-col items-center gap-3">
              <VerdictStamp score={score} size="lg" />
              <span className="text-caption text-ink-faint">{scoreBand(score).label}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-6 rounded-2xl border border-edge bg-surface p-6 shadow-card">
          {BAND_SAMPLES.map((score) => (
            <VerdictStamp key={score} score={score} size="md" />
          ))}
          {BAND_SAMPLES.map((score) => (
            <VerdictStamp key={`sm-${score}`} score={score} size="sm" />
          ))}
        </div>
      </section>

      {/* Chips */}
      <section className="mt-16">
        <SectionHeading
          eyebrow="05 — Compact reads"
          title="Chips, badges, and deltas"
          blurb="Where a stamp is too heavy — table rows, inline mentions — the same band and stance colors resolve down to a pill. Every one of these reads from the exact same token source as the stamp above; nothing is a separate palette."
        />
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-edge bg-surface p-6 shadow-card">
          <ScoreChip score={82} size="md" />
          <ScoreChip score={47} size="sm" />
          <StanceBadge stance="accelerate" conviction="high" />
          <ModeBadge mode="live" model="claude-opus-4-8" />
          <ModeBadge mode="simulated" />
          <DeltaBadge delta={4.2} />
          <DeltaBadge delta={-2.8} />
        </div>
      </section>

      {/* Redline */}
      <section className="mt-16">
        <SectionHeading
          eyebrow="06 — Editorial redline"
          title="A hypothesis revision reads like a copy edit"
          blurb="Blue pencil for insertions, red pencil for strikethroughs — the mark-up idiom an editor uses on a manuscript, not a code diff. Deliberately separate tokens from the verdict-band reds and greens: correcting a claim's wording isn't a verdict on it."
        />
        <div className="mt-6 rounded-2xl border border-edge bg-surface p-6 shadow-card">
          <p className="text-label font-semibold uppercase tracking-wide text-ink-faint">Proposed hypothesis revision</p>
          <div className="mt-2">
            <DiffView
              oldText="B2B sales teams will pay for an AI copilot that assembles meeting-prep briefs."
              newText="Enterprise AEs running complex, multi-stakeholder deals will pay for an AI copilot that assembles meeting-prep briefs from CRM, email, and call history."
            />
          </div>
        </div>
      </section>

      {/* Mobile nav */}
      <section className="mt-16">
        <SectionHeading
          eyebrow="07 — Mobile"
          title="An always-visible instrument console"
          blurb="Not a hamburger drawer — three destinations fit a thumb-reachable bottom bar without overflow, and nothing about the app's controls is ever a tap away behind an icon. The per-hypcheck switcher stays sidebar-only; the dashboard grid already does that job one tap from here."
        />
        <div className="mt-6 flex justify-center rounded-2xl border border-edge bg-paper p-8 shadow-card">
          <div className="w-[240px] overflow-hidden rounded-[28px] border border-edge-strong bg-surface shadow-lift">
            <div className="flex h-40 items-center justify-center border-b border-edge bg-paper/60 text-caption text-ink-faint">
              (page content)
            </div>
            <nav className="flex border-t border-edge bg-surface/95" aria-hidden>
              {[
                { label: "Dashboard", active: true },
                { label: "New", active: false },
                { label: "Admin", active: false },
              ].map((tab) => (
                <div
                  key={tab.label}
                  className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[10.5px] font-medium ${
                    tab.active ? "text-iris" : "text-ink-faint"
                  }`}
                >
                  <span className={`h-3.5 w-3.5 rounded-sm ${tab.active ? "bg-iris" : "bg-edge-strong"}`} />
                  {tab.label}
                </div>
              ))}
            </nav>
          </div>
        </div>
      </section>

      <footer className="mt-16 border-t border-edge pt-6 text-caption text-ink-faint">
        Built by hand for this hypcheck redesign — every token above lives in{" "}
        <code className="font-mono">globals.css</code> and is what the running app actually uses, light and dark.
      </footer>
    </div>
  );
}
