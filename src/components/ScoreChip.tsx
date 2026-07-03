import type { AnalystStance, BandKey } from "@/lib/types";
import { scoreBand, STANCE_LABELS } from "@/lib/types";

export const BAND_COLORS: Record<BandKey, { text: string; bg: string; dot: string; stroke: string }> = {
  strong: { text: "text-emerald-700", bg: "bg-emerald-50", dot: "bg-emerald-500", stroke: "#059669" },
  promising: { text: "text-teal-700", bg: "bg-teal-50", dot: "bg-teal-500", stroke: "#0d9488" },
  emerging: { text: "text-amber-700", bg: "bg-amber-50", dot: "bg-amber-500", stroke: "#d97706" },
  weak: { text: "text-rose-700", bg: "bg-rose-50", dot: "bg-rose-500", stroke: "#e11d48" },
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

export function ModeBadge({ mode }: { mode: "simulated" | "live" }) {
  return mode === "live" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-iris-soft px-2 py-0.5 text-[11px] font-medium text-iris">
      Live research
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-paper px-2 py-0.5 text-[11px] font-medium text-ink-faint ring-1 ring-inset ring-edge">
      Simulated
    </span>
  );
}

const STANCE_COLORS: Record<AnalystStance, { text: string; bg: string; dot: string }> = {
  accelerate: { text: "text-emerald-700", bg: "bg-emerald-50", dot: "bg-emerald-500" },
  advance: { text: "text-teal-700", bg: "bg-teal-50", dot: "bg-teal-500" },
  hold: { text: "text-amber-700", bg: "bg-amber-50", dot: "bg-amber-500" },
  reposition: { text: "text-orange-700", bg: "bg-orange-50", dot: "bg-orange-500" },
  retreat: { text: "text-rose-700", bg: "bg-rose-50", dot: "bg-rose-500" },
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
