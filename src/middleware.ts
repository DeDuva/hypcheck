import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Mirrors devOpenMode in lib/auth.ts (not imported — middleware runs on the
// edge runtime and must not pull in the database-backed auth instance).
const devOpen = process.env.NODE_ENV !== "production" && !process.env.GOOGLE_CLIENT_ID;

/**
 * Sign-in wall. This is a UX redirect, not the security boundary: it only
 * checks that a session cookie exists. Real session validation happens
 * server-side in lib/authz (pages, server actions, route handlers).
 */
export function middleware(request: NextRequest) {
  if (devOpen) return NextResponse.next();
  if (!getSessionCookie(request)) {
    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Everything except: the sign-in page, auth endpoints, cron (has its own
  // secret), health (returns a stripped body when unauthenticated), and
  // static assets.
  matcher: [
    "/((?!signin|api/auth|api/cron|api/health|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
