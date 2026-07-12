import { scoreBand } from "@/lib/types";
import { BAND_COLORS } from "./ScoreChip";

const SIZE_PX = { sm: 52, md: 92, lg: 132 } as const;
const NUM_SIZE = { sm: "text-[0.95rem]", md: "text-[1.4rem]", lg: "text-[2.1rem]" } as const;
// Two-word bands ("Strong signal", "Weak signal") wrap at sm/md sizes — cap
// the label's width so it wraps predictably instead of stretching toward
// the ring, and center it explicitly since a wrapped span's lines default
// to left-aligned even inside an items-center flex column.
const LABEL_WIDTH = { sm: 0, md: 64, lg: 96 } as const;

/**
 * The hero score treatment — a circular, band-colored gauge mark used
 * wherever the PMF score is the main point (dashboard cards, the overview
 * panel, the report header). ScoreChip's pill stays in use for compact/
 * inline contexts (table rows, the chart's pinned-point card) where a stamp
 * is too heavy; both read from the same BAND_COLORS source of truth.
 */
export function VerdictStamp({ score, size = "md" }: { score: number; size?: "sm" | "md" | "lg" }) {
  const band = scoreBand(score);
  const stroke = BAND_COLORS[band.key].stroke;
  const px = SIZE_PX[size];
  return (
    <div
      className="verdict-stamp relative flex shrink-0 items-center justify-center rounded-full"
      style={{ width: px, height: px, ["--stamp-color" as string]: stroke }}
    >
      <div className="z-[1] flex flex-col items-center gap-0.5">
        <span className={`tnum font-mono font-semibold tracking-tight ${NUM_SIZE[size]}`} style={{ color: stroke }}>
          {Math.round(score)}
        </span>
        {size !== "sm" && (
          <span
            className="text-label text-center font-sans font-semibold uppercase leading-tight tracking-[0.08em] opacity-85"
            style={{ color: stroke, maxWidth: LABEL_WIDTH[size] }}
          >
            {band.label}
          </span>
        )}
      </div>
    </div>
  );
}
