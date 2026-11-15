"use client";

// Next.js error boundary — catches render/render-time errors below the root
// layout. Uses the band-weak token (the same "confirmed bad" red used for
// error traces and the settings danger zone) rather than a raw Tailwind red,
// so it stays correct in dark mode like everything else in the app.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-16 text-center">
      <span className="tnum font-mono text-[3rem] font-semibold leading-none tracking-tight text-band-weak">500</span>
      <h1 className="mt-4 font-serif text-subhead italic tracking-tight text-ink">Signal lost</h1>
      <p className="mt-2 max-w-sm text-[13.5px] leading-relaxed text-ink-soft">
        Something broke running that check. The underlying data is untouched — retry, or head back to the dashboard.
      </p>
      {error.digest && <p className="mt-2 font-mono text-[11px] text-ink-faint">Ref: {error.digest}</p>}
      <div className="mt-6 flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-lg bg-iris px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-iris-deep"
        >
          Try again
        </button>
        {/* A full page load, not <Link>: after an error the client state itself may be what broke. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className="rounded-lg px-4 py-2 text-[13px] font-medium text-ink-soft transition-colors hover:text-ink">
          Back to dashboard
        </a>
      </div>
    </div>
  );
}
