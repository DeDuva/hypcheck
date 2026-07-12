import Link from "next/link";

// Rendered for any unmatched route, and for hypcheck/report/trace ids that
// don't resolve (authz.ts calls notFound() on both "doesn't exist" and "you
// don't have access" — same signal to a would-be prober either way). The
// "unfalsifiable" line and mono numeral echo VerdictStamp: a page that
// isn't there is treated the same way as a claim with no evidence for it.
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-16 text-center">
      <span className="tnum font-mono text-[3rem] font-semibold leading-none tracking-tight text-ink-faint">404</span>
      <h1 className="mt-4 font-serif text-subhead italic tracking-tight text-ink">Unfalsifiable</h1>
      <p className="mt-2 max-w-sm text-[13.5px] leading-relaxed text-ink-soft">
        Nothing here to test — the page doesn&apos;t exist, or you don&apos;t have access to it. Either way, there&apos;s
        no evidence to weigh.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-lg bg-iris px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-iris-deep"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
