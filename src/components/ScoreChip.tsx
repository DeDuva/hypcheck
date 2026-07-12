import type { AnalystStance, BandKey } from "@/lib/types";
import { familyFromModelId, MODEL_FAMILY_SHORT_LABELS, scoreBand, STANCE_LABELS } from "@/lib/types";

// Colors resolve through the token scale in globals.css (forest / slate teal
// / brass / brick, light+dark paired) — never hardcode a Tailwind palette
// color here, this object is the single source every other band-colored
// component (Sparkline, PmfChart, VerdictStamp, the dashboard legend) reads.
export const BAND_COLORS: Record<BandKey, { text: string; bg: string; dot: string; stroke: string }> = {
  strong: { text: "text-band-strong", bg: "bg-band-strong-tint", dot: "bg-band-strong", stroke: "var(--color-band-strong)" },
  promising: { text: "text-band-promising", bg: "bg-band-promising-tint", dot: "bg-band-promising", stroke: "var(--color-band-promising)" },
  emerging: { text: "text-band-emerging", bg: "bg-band-emerging-tint", dot: "bg-band-emerging", stroke: "var(--color-band-emerging)" },
  weak: { text: "text-band-weak", bg: "bg-band-weak-tint", dot: "bg-band-weak", stroke: "var(--color-band-weak)" },
};

export function BandDot({ band, muted }: { band: BandKey; muted?: boolean }) {
  return (
    <span
      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${muted ? "bg-edge-strong" : BAND_COLORS[band].dot}`}
    />
  );
}

export function ScoreChip({ score, size = "md" }: { score: number; size?: "sm" | "md" }) {
  const band = scoreBand(score);
  const c = BAND_COLORS[band.key];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${c.bg} ${c.text} ${
        size === "sm" ? "px-2 py-0.5 text-[11.5px]" : "px-2.5 py-1 text-[12.5px]"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {band.label}
    </span>
  );
}

/** Shows which model produced the run — the fact that matters more than "was it live". */
export function ModeBadge({ mode, model }: { mode: "simulated" | "live"; model?: string | null }) {
  if (mode !== "live") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-paper px-2 py-0.5 text-[11px] font-medium text-ink-faint ring-1 ring-inset ring-edge">
        Simulated
      </span>
    );
  }
  const label = model ? MODEL_FAMILY_SHORT_LABELS[familyFromModelId(model)] : "Live research";
  return (
    <span
      title={model ?? undefined}
      className="inline-flex items-center gap-1 rounded-full bg-iris-soft px-2 py-0.5 text-[11px] font-medium text-iris"
    >
      {label}
    </span>
  );
}

// A five-step diverging dial, deliberately a different hue family from
// BAND_COLORS above — "what to do" and "how strong is the signal" are
// different axes and shouldn't share a palette.
export const STANCE_COLORS: Record<AnalystStance, { text: string; bg: string; dot: string }> = {
  accelerate: { text: "text-stance-accelerate", bg: "bg-stance-accelerate-tint", dot: "bg-stance-accelerate" },
  advance: { text: "text-stance-advance", bg: "bg-stance-advance-tint", dot: "bg-stance-advance" },
  hold: { text: "text-stance-hold", bg: "bg-stance-hold-tint", dot: "bg-stance-hold" },
  reposition: { text: "text-stance-reposition", bg: "bg-stance-reposition-tint", dot: "bg-stance-reposition" },
  retreat: { text: "text-stance-retreat", bg: "bg-stance-retreat-tint", dot: "bg-stance-retreat" },
};

export function StanceBadge({ stance, conviction }: { stance: AnalystStance; conviction?: string }) {
  const c = STANCE_COLORS[stance];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-medium ${c.bg} ${c.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      Analyst’s call: {STANCE_LABELS[stance]}
      {conviction && <span className="font-normal opacity-70">· {conviction} conviction</span>}
    </span>
  );
}
