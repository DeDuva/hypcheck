import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth, devOpenMode, isEmailAllowed } from "./auth";
import { ensureUserRow, getAccessGrant, getHypcheck } from "./store";
import type { GlobalRole, Hypcheck } from "./types";
import { logger } from "./logger";

/** The authenticated caller, as seen by pages, actions, and route handlers. */
export interface Viewer {
  id: string;
  email: string;
  name: string;
  image: string | null;
  role: GlobalRole;
}

const DEV_VIEWER: Viewer = { id: "local-dev", email: "dev@localhost", name: "Local dev", image: null, role: "admin" };

// Once per process: hypchecks.owner_id FK-references "user"(id), so the
// synthetic dev viewer must exist as a real row before it can own anything.
let devUserEnsured: Promise<void> | null = null;
function ensureDevUser(): Promise<void> {
  if (!devUserEnsured) {
    devUserEnsured = ensureUserRow(DEV_VIEWER).catch((err) => {
      devUserEnsured = null; // retry on next request rather than caching the failure
      throw err;
    });
  }
  return devUserEnsured;
}

/** Resolve the current session to a Viewer, or null when not signed in. */
export async function getViewer(): Promise<Viewer | null> {
  if (devOpenMode) {
    await ensureDevUser();
    return DEV_VIEWER;
  }
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  // Re-check the invite list on every read so removing an email revokes
  // access immediately, not just at signup.
  if (!isEmailAllowed(session.user.email)) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image ?? null,
    role: ((session.user as unknown as { role?: GlobalRole }).role ?? "member") as GlobalRole,
  };
}

/**
 * The authorization gate for pages and server actions. Server actions are
 * directly callable POST endpoints, so every action MUST call this (or a
 * stricter variant) before touching the store or the research engine —
 * hiding buttons in the UI is not a security boundary.
 */
export async function requireUser(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/signin");
  return viewer;
}

/**
 * Phase 2 rolls out in shadow mode: violations are logged but not blocked
 * until HYPCHECK_ENFORCE_ROLES=enforce, so existing data/behavior can be
 * verified against the new access matrix before it starts denying anyone.
 * See docs/deploying.md.
 */
function enforceRoles(): boolean {
  return process.env.HYPCHECK_ENFORCE_ROLES === "enforce";
}

export type EffectiveRole = "admin" | "owner" | "editor" | "viewer" | null;

const ROLE_RANK: Record<Exclude<EffectiveRole, null>, number> = { viewer: 1, editor: 2, owner: 3, admin: 4 };

/** The caller's effective access level on a specific hypcheck. */
export async function effectiveHypcheckRole(viewer: Viewer, hypcheck: Hypcheck): Promise<EffectiveRole> {
  if (viewer.role === "admin") return "admin";
  if (hypcheck.ownerId === viewer.id) return "owner";
  // Hypchecks created before phase 2 have no owner — grandfather them in as
  // shared/editable so existing users see no behavior change.
  if (!hypcheck.ownerId) return "editor";
  const grant = await getAccessGrant(hypcheck.id, viewer.id);
  return grant?.role ?? null;
}

/**
 * Require at least `min` access on a hypcheck. Fetches and returns the
 * hypcheck so callers don't need a second read. In shadow mode (the
 * default) a denial is logged but the call still succeeds.
 */
export async function requireHypcheckAccess(
  hypcheckId: string,
  min: "viewer" | "editor" | "owner" = "viewer"
): Promise<{ viewer: Viewer; hypcheck: Hypcheck; role: EffectiveRole }> {
  const viewer = await requireUser();
  const hypcheck = await getHypcheck(hypcheckId);
  if (!hypcheck) notFound();
  const role = await effectiveHypcheckRole(viewer, hypcheck);
  const allowed = role !== null && ROLE_RANK[role] >= ROLE_RANK[min];
  if (!allowed) {
    logger.warn("authz.hypcheck.denied", { userId: viewer.id, hypcheckId, min, role, enforced: enforceRoles() });
    if (enforceRoles()) redirect("/");
  }
  return { viewer, hypcheck, role };
}

/** Members can view what's shared with them but cannot own hypchecks. */
export async function requireCanCreateHypcheck(): Promise<Viewer> {
  const viewer = await requireUser();
  if (viewer.role === "member") {
    logger.warn("authz.create.denied", { userId: viewer.id, enforced: enforceRoles() });
    if (enforceRoles()) redirect("/");
  }
  return viewer;
}
