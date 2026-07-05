import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { ensureSeeded } from "@/lib/seed";
import { latestRun, listHypchecks } from "@/lib/store";
import { scoreBand } from "@/lib/types";
import { BandDot } from "@/components/ScoreChip";
import { UserMenu } from "@/components/UserMenu";
import { getViewer } from "@/lib/authz";
import { devOpenMode } from "@/lib/auth";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Hypcheck — track product-market fit over time",
  description:
    "Establish a product hypothesis, track PMF signal over time with scheduled research runs, and fold insights back into the hypothesis.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Unauthenticated requests (the sign-in page) get a bare shell — the
  // sidebar below fetches and displays hypcheck names, which must not render
  // for anonymous visitors.
  const viewer = await getViewer();
  if (!viewer) {
    return (
      <html lang="en">
        <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>{children}</body>
      </html>
    );
  }

  await ensureSeeded();
  const hypchecks = await listHypchecks();
  const withScores = await Promise.all(
    hypchecks.map(async (h) => ({ hypcheck: h, run: await latestRun(h.id) }))
  );

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <div className="flex min-h-screen">
          <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-edge bg-surface md:flex">
            <Link href="/" className="flex items-center gap-2.5 px-5 pt-5 pb-4">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-iris text-white">
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M1.5 11.5L5 7l2.5 2.5L11 5l3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="11" cy="5" r="1.6" fill="currentColor" stroke="none" />
                </svg>
              </span>
              <span className="text-[15px] font-semibold tracking-tight">Hypcheck</span>
            </Link>

            <nav className="px-3">
              <Link
                href="/"
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13.5px] font-medium text-ink-soft transition-colors hover:bg-paper hover:text-ink"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M2.5 8.5L8 3l5.5 5.5M4 7.5V13h8V7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Dashboard
              </Link>
              <Link
                href="/new"
                className="mt-0.5 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13.5px] font-medium text-ink-soft transition-colors hover:bg-paper hover:text-ink"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                New hypcheck
              </Link>
            </nav>

            <div className="mt-6 flex-1 overflow-y-auto px-3 pb-4">
              <p className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                Your hypchecks
              </p>
              {withScores.map(({ hypcheck, run }) => (
                <Link
                  key={hypcheck.id}
                  href={`/hypcheck/${hypcheck.id}`}
                  className="group flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-[13px] text-ink-soft transition-colors hover:bg-paper hover:text-ink"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {run ? <BandDot band={scoreBand(run.pmfScore).key} /> : <BandDot band="emerging" muted />}
                    <span className="truncate">{hypcheck.name}</span>
                  </span>
                  {run && <span className="tnum text-[12px] font-medium text-ink-faint">{Math.round(run.pmfScore)}</span>}
                </Link>
              ))}
            </div>

            <div className="border-t border-edge px-5 py-3.5">
              <p className="text-[11.5px] leading-relaxed text-ink-faint">
                {process.env.ANTHROPIC_API_KEY ? (
                  <>Live research enabled</>
                ) : (
                  <>Demo mode — simulated runs. Set <code className="font-mono">ANTHROPIC_API_KEY</code> for live research.</>
                )}
              </p>
            </div>

            <div className="border-t border-edge px-4 py-3">
              {devOpenMode ? (
                <p className="text-[11.5px] leading-relaxed text-ink-faint">
                  Local dev — sign-in off. Set <code className="font-mono">GOOGLE_CLIENT_ID</code> to enable auth.
                </p>
              ) : (
                <UserMenu viewer={viewer} />
              )}
            </div>
          </aside>

          <main className="min-w-0 flex-1 md:pl-60">{children}</main>
        </div>
      </body>
    </html>
  );
}
