export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Date + time — disambiguates multiple runs on the same day without extra chrome. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Time only, e.g. "2:34 PM". */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/**
 * Strip a leaked conversational preamble that some older runs stored ahead of
 * the report's first heading (e.g. "Now I have enough data … Here is the full
 * research report:"). Reports authored by `buildReportMd` begin with a heading,
 * so this is a no-op for them; only stray prose before the first heading is removed.
 */
export function stripReportPreamble(md: string): string {
  const firstHeading = md.search(/^#{1,6}\s/m);
  if (firstHeading <= 0) return md;
  const before = md.slice(0, firstHeading);
  // Leave structured content (quotes, lists, tables) untouched — only drop plain prose.
  if (/^\s*[>\-*|]/m.test(before)) return md;
  return md.slice(firstHeading).trimStart();
}

export function formatDelta(delta: number): string {
  const rounded = Math.round(delta * 10) / 10;
  if (rounded > 0) return `+${rounded}`;
  return String(rounded);
}

export function relativeDays(iso: string): string {
  const days = Math.round((new Date(iso).getTime() - Date.now()) / (24 * 3600 * 1000));
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days > 0) return `in ${days} days`;
  return `${-days} days ago`;
}
