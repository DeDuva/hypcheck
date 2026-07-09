import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { LibsqlDialect } from "@libsql/kysely-libsql";
import fs from "node:fs";
import path from "node:path";
import { logger } from "./logger";
import { activatePendingInvitations, getAllowedEmail, listAllowedEmails } from "./store";

/**
 * Auth posture:
 * - Production is invite-only by construction: sign-in requires Google OAuth
 *   config, and new accounts are rejected unless their email is in
 *   ALLOWED_EMAILS. No config → nobody gets in.
 * - Local dev without Google config runs "open" (no sign-in wall, a synthetic
 *   local user) so `npm run dev` keeps working with zero setup. Setting
 *   GOOGLE_CLIENT_ID locally turns the real wall on in dev too.
 */
export const devOpenMode = process.env.NODE_ENV !== "production" && !process.env.GOOGLE_CLIENT_ID;

export const authConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

/** ALLOWED_EMAILS, parsed. Exported so the admin console can show which
 * users are covered by the env var (and therefore can't be revoked there). */
export function envAllowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Two invite lists, either one grants access: ALLOWED_EMAILS (comma-
 * separated env var — a deploy-time bootstrap path, mainly useful for the
 * very first admin before anyone can use the /admin console) and the
 * DB-backed `allowed_emails` table (admin-editable at runtime — see
 * src/app/admin). Checked at signup AND on every session read, so removing
 * an email from either revokes access even for existing accounts. Both
 * empty means: allow in dev, deny in production.
 */
export async function isEmailAllowed(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  const envList = envAllowedEmails();
  if (envList.includes(normalized)) return true;
  if (await getAllowedEmail(normalized)) return true;
  if (envList.length === 0 && process.env.NODE_ENV !== "production") {
    // Nothing configured anywhere: stay open, matching the zero-config dev
    // experience from before either invite list existed.
    return (await listAllowedEmails()).length === 0;
  }
  return false;
}

/** Same connection logic as db.ts — auth tables live in the same database. */
function authDialect(): LibsqlDialect {
  if (process.env.TURSO_DATABASE_URL) {
    return new LibsqlDialect({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  const dir = path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  return new LibsqlDialect({ url: `file:${path.join(dir, "hypcheck.db")}` });
}

function baseURL(): string | undefined {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return undefined; // better-auth falls back to the request origin (fine for local dev)
}

export const auth = betterAuth({
  appName: "Hypcheck",
  baseURL: baseURL(),
  database: { dialect: authDialect(), type: "sqlite" },
  socialProviders: authConfigured
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        },
      }
    : undefined,
  // Cache the session in a signed cookie so most requests skip the DB
  // round-trip (matters on Turso, where every query crosses a region).
  session: { cookieCache: { enabled: true, maxAge: 5 * 60 } },
  user: {
    additionalFields: {
      // Global role for phase-2 access control (src/lib/authz.ts). `input:
      // false` keeps it out of the signup payload — only the hook below or
      // the /admin console (updateUserRoleAction) may set it.
      role: { type: "string", required: false, defaultValue: "member", input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const normalized = user.email.trim().toLowerCase();
          if (!(await isEmailAllowed(normalized))) {
            logger.warn("auth.signup.denied", { email: user.email });
            throw new APIError("FORBIDDEN", {
              message: "Hypcheck is invite-only. Ask an administrator to add your email.",
            });
          }
          // Least-privilege by default: `member` unless an admin explicitly
          // added this email at a higher role from the /admin console. An
          // email allowed only via the ALLOWED_EMAILS env var (no matching
          // allowed_emails row) still starts at `member`.
          const allowedEmail = await getAllowedEmail(normalized);
          const role = allowedEmail?.role ?? "member";
          logger.info("auth.signup", { email: user.email, role });
          return { data: { ...user, role } };
        },
        after: async (user) => {
          const activated = await activatePendingInvitations(user.id, user.email.trim().toLowerCase());
          if (activated > 0) logger.info("auth.invitations.activated", { email: user.email, count: activated });
        },
      },
    },
  },
});
