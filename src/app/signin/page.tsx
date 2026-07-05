import { redirect } from "next/navigation";
import { getViewer } from "@/lib/authz";
import { authConfigured } from "@/lib/auth";
import { SignInButton } from "@/components/SignInButton";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const viewer = await getViewer();
  if (viewer) redirect("/");
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm rounded-2xl border border-edge bg-surface p-8 shadow-sm">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-iris text-white">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M1.5 11.5L5 7l2.5 2.5L11 5l3.5 3.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="11" cy="5" r="1.6" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <span className="text-lg font-semibold tracking-tight">Hypcheck</span>
        </div>

        <h1 className="mt-6 text-[15px] font-medium text-ink">Sign in to continue</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
          Hypcheck is invite-only. Sign in with the Google account your invitation was sent to.
        </p>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-red-700">
            You couldn&apos;t be signed in. If you were invited, make sure you used the invited
            Google account — otherwise ask an administrator to add your email.
          </div>
        )}

        <div className="mt-6">
          {authConfigured ? (
            <SignInButton />
          ) : (
            <p className="rounded-lg border border-edge bg-paper px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-faint">
              Sign-in isn&apos;t configured yet. An administrator needs to set{" "}
              <code className="font-mono">GOOGLE_CLIENT_ID</code> and{" "}
              <code className="font-mono">GOOGLE_CLIENT_SECRET</code>.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
