"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Area,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { scoreBand } from "@/lib/types";
import { BAND_COLORS, ModeBadge, ScoreChip } from "./ScoreChip";
import { DeltaBadge } from "./DeltaBadge";
import { formatDate, formatDateShort } from "@/lib/format";

export interface ChartPoint {
  runId: string;
  date: string; // ISO
  score: number;
  execSummary: string;
  version: number;
  mode: "simulated" | "live";
  model: string | null;
  versionChange: boolean;
  carriedForward: boolean; // no fresh signal this run — every metric carried its prior score
}

const IRIS = "#4f46e5";

interface TooltipPayload {
  payload?: ChartPoint;
}

function HoverTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  const band = scoreBand(point.score);
  return (
    <div className="max-w-[300px] rounded-xl border border-edge bg-surface p-3.5 shadow-lift">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] font-medium text-ink-faint">{formatDate(point.date)}</span>
        <span className="tnum text-[15px] font-semibold" style={{ color: BAND_COLORS[band.key].stroke }}>
          {Math.round(point.score)}
        </span>
      </div>
      {point.carriedForward && (
        <p className="mt-1.5 text-[11.5px] font-medium text-ink-faint">No fresh signal — score carried forward</p>
      )}
      <p className="mt-2 line-clamp-4 text-[12.5px] leading-relaxed text-ink-soft">{point.execSummary}</p>
      <p className="mt-2.5 flex items-center gap-1 text-[11px] font-medium text-iris">
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M4 8h8M9 4.5L12.5 8 9 11.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Click the point to pin details &amp; open the report
      </p>
    </div>
  );
}

export function PmfChart({ points, hypcheckId }: { points: ChartPoint[]; hypcheckId: string }) {
  const [pinnedId, setPinnedId] = useState<string | null>(points.length ? points[points.length - 1].runId : null);

  const pinned = useMemo(() => points.find((p) => p.runId === pinnedId) ?? null, [points, pinnedId]);
  const pinnedIdx = pinned ? points.findIndex((p) => p.runId === pinned.runId) : -1;
  const prev = pinnedIdx > 0 ? points[pinnedIdx - 1] : null;
  const versionMarkers = points.filter((p) => p.versionChange);

  return (
    <div>
      <div className="h-[300px] w-full" data-testid="pmf-chart">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={points}
            margin={{ top: 12, right: 12, bottom: 4, left: -18 }}
            onClick={(state) => {
              const p = state?.activePayload?.[0]?.payload as ChartPoint | undefined;
              if (p) setPinnedId(p.runId);
            }}
          >
            <defs>
              <linearGradient id="pmfFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={IRIS} stopOpacity={0.16} />
                <stop offset="100%" stopColor={IRIS} stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tickFormatter={formatDateShort}
              tick={{ fontSize: 11, fill: "#8a867a" }}
              axisLine={{ stroke: "#e7e5df" }}
              tickLine={false}
              minTickGap={40}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tick={{ fontSize: 11, fill: "#8a867a" }}
              axisLine={false}
              tickLine={false}
            />
            {[40, 55, 70].map((y) => (
              <ReferenceLine key={y} y={y} stroke="#e7e5df" strokeDasharray="3 4" />
            ))}
            {versionMarkers.map((p) => (
              <ReferenceLine
                key={p.runId}
                x={p.date}
                stroke="#b8b4a8"
                strokeDasharray="4 4"
                label={{
                  value: `v${p.version}`,
                  position: "top",
                  fontSize: 10.5,
                  fill: "#57544b",
                  fontWeight: 600,
                }}
              />
            ))}
            <Tooltip content={<HoverTooltip />} cursor={{ stroke: "#d6d3cb", strokeWidth: 1 }} />
            <Area type="monotone" dataKey="score" stroke="none" fill="url(#pmfFill)" isAnimationActive={false} />
            <Line
              type="monotone"
              dataKey="score"
              stroke={IRIS}
              strokeWidth={2.25}
              isAnimationActive={false}
              dot={(props) => {
                const { cx, cy, payload, index } = props as { cx: number; cy: number; payload: ChartPoint; index: number };
                const isPinned = payload.runId === pinnedId;
                // Carried-forward runs (no fresh signal) render hollow and muted
                // so a flat stretch reads as "nothing new", not "re-confirmed".
                const stroke = payload.carriedForward ? "#b8b4a8" : IRIS;
                return (
                  <circle
                    key={`dot-${index}`}
                    cx={cx}
                    cy={cy}
                    r={isPinned ? 5 : 3}
                    fill={isPinned ? stroke : "#fff"}
                    stroke={stroke}
                    strokeWidth={isPinned ? 2 : 1.75}
                    style={{ cursor: "pointer" }}
                  />
                );
              }}
              activeDot={{ r: 5.5, fill: IRIS, stroke: "#fff", strokeWidth: 2, cursor: "pointer" }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {pinned && (
        <div className="mt-4 rounded-xl border border-edge bg-paper/60 p-4" data-testid="pinned-run">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="text-[12.5px] font-medium text-ink">{formatDate(pinned.date)}</span>
              <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-ink-soft ring-1 ring-inset ring-edge">
                Hypothesis v{pinned.version}
              </span>
              <ModeBadge mode={pinned.mode} model={pinned.model} />
              {pinned.carriedForward && (
                <span className="rounded-full bg-paper px-2 py-0.5 text-[11px] font-medium text-ink-faint ring-1 ring-inset ring-edge">
                  Carried forward
                </span>
              )}
            </div>
            <div className="flex items-center gap-2.5">
              <span className="tnum text-[18px] font-semibold leading-none">{Math.round(pinned.score)}</span>
              {prev && <DeltaBadge delta={pinned.score - prev.score} />}
              <ScoreChip score={pinned.score} size="sm" />
            </div>
          </div>
          <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink-soft">{pinned.execSummary}</p>
          <Link
            href={`/hypcheck/${hypcheckId}/report/${pinned.runId}`}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-surface px-3 py-1.5 text-[12.5px] font-medium text-iris ring-1 ring-inset ring-edge transition-colors hover:bg-iris-soft"
          >
            Read full report
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M4 8h8M9 4.5L12.5 8 9 11.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>
      )}
    </div>
  );
}
