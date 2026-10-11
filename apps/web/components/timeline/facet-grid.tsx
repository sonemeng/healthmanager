"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  ReferenceArea,
} from "recharts";
import { Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/health/status-badge";
import { TimelineAxis } from "./timeline-lanes";
import { SERIES_COLORS } from "./watch-curves";
import type { MetricSeries, Tick, TimeWindow } from "./derive";

// ---------------------------------------------------------------------------
// 多指标同屏（spec 18 §2）：关注指标分面小图矩阵
// 纵轴各自独立（不合并量纲），横轴与泳道共用时间刻度；点小图放大。
// ---------------------------------------------------------------------------

interface FacetGridProps {
  items: MetricSeries[];
  win: TimeWindow;
  ticks: Tick[];
  onExpand: (series: MetricSeries) => void;
}

interface DotProps {
  cx?: number;
  cy?: number;
  index?: number;
}

function Facet({
  series,
  color,
  win,
  onExpand,
}: {
  series: MetricSeries;
  color: string;
  win: TimeWindow;
  onExpand: (series: MetricSeries) => void;
}) {
  const last = series.points[series.points.length - 1];
  const enough = series.points.length >= 2;
  const data = series.points.map((p) => ({ t: p.t, v: p.v, abnormal: p.abnormal }));

  return (
    <button
      type="button"
      onClick={() => onExpand(series)}
      title={enough ? "点击查看大图" : series.name}
      className="card group flex flex-col p-3 text-left transition-colors hover:border-accent-300"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[12px] font-medium text-neutral-900 font-body">
              {series.name}
            </span>
            {series.status !== "normal" && (
              <StatusBadge status={series.status} label="异常" />
            )}
          </div>
          <span className="mt-0.5 block font-mono text-[10px] text-neutral-400">
            {last ? `${last.v}${series.unit ? ` ${series.unit}` : ""}` : "—"}
            {series.refLow != null || series.refHigh != null
              ? ` · 参考 ${series.refLow ?? "—"}~${series.refHigh ?? "—"}`
              : ""}
          </span>
        </div>
        <Maximize2 className="size-3 shrink-0 text-neutral-300 group-hover:text-accent-500" />
      </div>

      <div className="mt-1 h-[68px]">
        {!enough ? (
          <div className="flex h-full items-center justify-center">
            <span className="font-mono text-[10px] text-neutral-400">
              检查不足 2 次，暂无法绘制趋势
            </span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 4, bottom: 2, left: 4 }}>
              {series.refLow != null && series.refHigh != null && (
                <ReferenceArea
                  y1={series.refLow}
                  y2={series.refHigh}
                  fill="var(--color-health-normal-bg)"
                  stroke="var(--color-health-normal-border)"
                  strokeDasharray="2 2"
                  fillOpacity={0.45}
                />
              )}
              <XAxis
                dataKey="t"
                type="number"
                domain={[win.start, win.end]}
                hide
              />
              <YAxis hide domain={["auto", "auto"]} />
              <Line
                type="monotone"
                dataKey="v"
                stroke={color}
                strokeWidth={1.5}
                isAnimationActive={false}
                dot={(props: unknown) => {
                  const { cx, cy, index } = props as DotProps;
                  const abnormal = data[index ?? 0]?.abnormal === true;
                  return (
                    <circle
                      key={index ?? 0}
                      cx={cx}
                      cy={cy}
                      r={abnormal ? 3 : 2}
                      fill={abnormal ? "var(--color-health-warning)" : "white"}
                      stroke={abnormal ? "var(--color-health-warning)" : color}
                      strokeWidth={abnormal ? 2 : 1.5}
                    />
                  );
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </button>
  );
}

export function FacetGrid({ items, win, ticks, onExpand }: FacetGridProps) {
  if (items.length === 0) return null;

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[13px] font-semibold text-neutral-900 font-display">
            关注指标同屏
          </h2>
          <span className="bg-neutral-100 px-2 py-0.5 font-mono text-[10px] font-bold tabular-nums text-neutral-500">
            {items.length}
          </span>
        </div>
        <p className="font-mono text-[11px] text-neutral-400">
          纵轴各自独立 · 横轴与泳道共用
        </p>
      </div>

      <div className="p-4">
        <div
          className={cn(
            "grid gap-3",
            "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3",
          )}
        >
          {items.map((s, i) => (
            <Facet
              key={s.code}
              series={s}
              color={SERIES_COLORS[i % SERIES_COLORS.length] as string}
              win={win}
              onExpand={onExpand}
            />
          ))}
        </div>

        {/* 共用时间刻度（与上方泳道一致） */}
        <div className="mt-3">
          <TimelineAxis ticks={ticks} win={win} />
        </div>
      </div>

      <p className="border-t border-neutral-100 px-4 py-2 font-mono text-[10px] text-neutral-400">
        色带为各指标自身的参考区间；点任意小图可放大查看。
      </p>
    </div>
  );
}
