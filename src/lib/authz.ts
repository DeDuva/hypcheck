import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, devOpenMode, isEmailAllowed } from "./auth";

/** The authenticated caller, as seen by pages, actions, and route handlers. */
export interface Viewer {
  id: string;
  email: string;
  name: string;
  image: string | null;
}

const DEV_VIEWER: Viewer = { id: "local-dev", email: "dev@localhost", name: "Local dev", image: null };

/** Resolve the current session to a Viewer, or null when not signed in. */
export async function getViewer(): Promise<Viewer | null> {
  if (devOpenMode) return DEV_VIEWER;
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
