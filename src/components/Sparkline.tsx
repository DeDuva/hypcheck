import { BAND_COLORS } from "./ScoreChip";
import { scoreBand } from "@/lib/types";

/** Tiny server-rendered SVG sparkline of PMF scores. */
export function Sparkline({ scores, width = 120, height = 32 }: { scores: number[]; width?: number; height?: number }) {
  if (scores.length < 2) {
    return <div style={{ width, height }} className="rounded bg-paper" />;
  }
  const min = Math.min(...scores) - 4;
  const max = Math.max(...scores) + 4;
  const range = max - min || 1;
  const stepX = width / (scores.length - 1);
  const points = scores.map((s, i) => [i * stepX, height - ((s - min) / range) * height] as const);
  const path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${path} L${width},${height} L0,${height} Z`;
  const color = BAND_COLORS[scoreBand(scores[scores.length - 1]).key].stroke;
  const last = points[points.length - 1];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="overflow-visible">
      <path d={area} fill={color} opacity={0.08} />
      <path d={path} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={2.5} fill={color} />
    </svg>
  );
}
