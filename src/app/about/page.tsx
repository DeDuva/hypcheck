import Link from "next/link";
import type { Metadata } from "next";
import { ThemeToggle } from "@/components/ThemeToggle";

export const metadata: Metadata = {
  title: "Hypcheck — About",
  description: "What Hypcheck is, why it exists, and who built it.",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12 lg:px-8">
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
        <p className="text-label font-semibold uppercase tracking-[0.1em] text-ink-faint">About</p>
        <h1 className="text-balance mt-2 font-serif text-display italic tracking-tight text-ink">
          Ask the market, not your users.
        </h1>
      </header>

      {/* What this is */}
      <section className="mt-10">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-faint">What this is</h2>
        <div className="mt-2.5 space-y-3 text-body leading-relaxed text-ink-soft">
          <p>
            Hypcheck tracks whether a product hypothesis is gaining or losing product-market fit — without asking a
            single user or running a single survey. You write the hypothesis as a falsifiable claim, define the
            public signals that would prove or disprove it, and Hypcheck re-tests it against the open market on a
            schedule: competitor launches, pricing moves, hiring patterns, search and community volume. Every run
            produces a PMF score, an analyst&rsquo;s call on what to do about it, and — when the evidence warrants —
            a proposed revision to the hypothesis itself.
          </p>
          <p>
            It&rsquo;s less a dashboard than a recurring research brief, written by an instrument that never gets
            tired of checking, never has a stake in being right, and never mistakes a founder&rsquo;s conviction for
            evidence.
          </p>
        </div>
      </section>

      {/* Why we made it */}
      <section className="mt-10">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-faint">Why we made it</h2>
        <div className="mt-2.5 space-y-3 text-body leading-relaxed text-ink-soft">
          <p>
            Most PMF validation is a founder or a team asking the people closest to them whether an idea is any good
            — which is exactly the group least able to answer honestly. The market doesn&rsquo;t have that bias, and
            it&rsquo;s talking constantly, in public, whether anyone&rsquo;s listening or not: who&rsquo;s hiring for
            the workflow you&rsquo;re betting on, who just shipped a feature that makes your wedge smaller, who&rsquo;s
            raising money in your category. Hypcheck exists to listen to that on a schedule instead of once, at the
            start, when the conviction to hear bad news is lowest.
          </p>
          <p>
            It&rsquo;s also a real exercise in building the way I think product work increasingly gets done: one
            person, working with Claude Code end to end — the product thinking, the research engine, the interface,
            and the visual identity below — rather than a large team and a long roadmap. That&rsquo;s not incidental
            to what I do at work; it&rsquo;s the question I spend my days on.
          </p>
        </div>
      </section>

      {/* Who built it */}
      <section className="mt-10">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-faint">Who built it</h2>
        <div className="mt-2.5 flex gap-4 rounded-2xl border border-edge bg-surface p-5 shadow-card">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-iris/10 text-[15px] font-semibold text-iris">
            D
          </span>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-ink">Dov Zimring</p>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">
              I&rsquo;ve spent 15 years at Google building things from zero to one. I was Google Fiber&rsquo;s first
              hire, working residential and small-business product — the Fiber Jack, the Network Box — while U.S.
              broadband went from an average of around 5 Mbps to gigabit being table stakes. From there I led
              zero-to-one infrastructure, product, and publishing for Stadia, Google&rsquo;s cloud gaming platform,
              including Emmy-winning 4K/60 HDR silicon and the edge-compute network behind it. Today I lead product,
              developer relations, data science, and go-to-market teams working on what AI-first software
              development actually looks like — which is exactly what Hypcheck is: a small, real answer to a
              question I ask my own teams every week.
            </p>
            <a
              href="https://www.linkedin.com/in/dovzimring/"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-iris transition-colors hover:text-iris-deep"
            >
              LinkedIn
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M6 3h7v7M13 3L4 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          </div>
        </div>
      </section>

      {/* Design system CTA */}
      <Link
        href="/about/design-system"
        className="group mt-10 flex items-center justify-between gap-4 rounded-2xl border border-edge bg-surface p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lift"
      >
        <div>
          <p className="text-label font-semibold uppercase tracking-[0.1em] text-ink-faint">Also worth a look</p>
          <p className="mt-1 font-serif text-[17px] italic tracking-tight text-ink group-hover:text-iris">
            The design system behind it
          </p>
          <p className="mt-1 text-[12.5px] text-ink-soft">
            Every color, type step, and component decision — a live page, not a deck.
          </p>
        </div>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 text-ink-faint transition-colors group-hover:text-iris" aria-hidden>
          <path d="M6 3.5L11 8l-5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
    </div>
  );
}
