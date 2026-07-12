import { formatDelta } from "@/lib/format";

export function DeltaBadge({ delta }: { delta: number }) {
  const rounded = Math.round(delta * 10) / 10;
  if (rounded === 0) {
    return <span className="tnum text-[12.5px] font-medium text-ink-faint">—</span>;
  }
  const up = rounded > 0;
  return (
    <span className={`tnum inline-flex items-center gap-0.5 text-[12.5px] font-medium ${up ? "text-band-strong" : "text-band-weak"}`}>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden className={up ? "" : "rotate-180"}>
        <path d="M5 8V2M2 5l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {formatDelta(Math.abs(rounded))}
    </span>
  );
}
