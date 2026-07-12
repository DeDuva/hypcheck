import { cookies } from "next/headers";

/**
 * Theme preference, cookie-backed so the server-rendered `<html>` picks the
 * right class on first paint — no flash, and no client-side theme-context
 * provider (this app has none today; every page is a server component).
 * "system" means "no explicit choice yet" — the inline script in layout.tsx
 * resolves that case from `prefers-color-scheme` before hydration.
 */
export type Theme = "light" | "dark";

export const THEME_COOKIE = "hc-theme";

/** Read the persisted theme, or null if the visitor hasn't chosen yet. */
export async function getTheme(): Promise<Theme | null> {
  const store = await cookies();
  const value = store.get(THEME_COOKIE)?.value;
  return value === "light" || value === "dark" ? value : null;
}
