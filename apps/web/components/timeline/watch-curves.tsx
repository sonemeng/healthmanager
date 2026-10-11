"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceArea,
  Brush,
} from "recharts";
import { Activity, CalendarRange, SlidersHorizontal, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useModal } from "@/components/modal/provider";
import { Template } from "@/components/modal/template";
import { StatusBadge } from "@/components/health/status-badge";
import {
  fmtYearMonth,
  type Granularity,
  type MetricSeries,
  type Tick,
  type TimeWindow,
} from "./derive";

// ---------------------------------------------------------------------------
// 时间线 C（spec 18 §1）+ 分面小图（§2）：关注指标曲线（与泳道共用时间轴）
// 底部 recharts Brush 拖动选段；粒度按钮「按年 / 按月」。
// ---------------------------------------------------------------------------

const LINE_COLORS = ["var(--color-accent-500)", "#0d9488"];

export const SERIES_COLORS = LINE_COLORS;

interface WatchCurvesProps {
  series: MetricSeries[];
  available: { code: string; name: string }[];
  selected: string[];
  onSelectedChange: (codes: string[]) => void;
  win: TimeWindow;
  onWindowChange: (w: TimeWindow) => void;
  granularity: Granularity;
  onGranularityChange: (g: Granularity) => void;
  ticks: Tick[];
}

interface DotProps {
  cx?: number;
  cy?: number;
  index?: number;
}

/* --------------------------- 指标选择小面板 --------------------------- */

function MetricPickerModal({
  available,
  selected,
  onApply,
}: {
  available: { code: string; name: string }[];
  selected: string[];
  onApply: (codes: string[]) => void;
}) {
  const modal = useModal();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>(selected);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? available.filter((m) => m.name.toLowerCase().includes(q))
      : available;
    return list.slice(0, 80);
  }, [available, query]);

  const toggle = (code: string) => {
    setPicked((prev) => {
      if (prev.includes(code)) return prev.filter((c) => c !== code);
      if (prev.length >= 2) return [prev[1] as string, code];
      return [...prev, code];
    });
  };

  return (
    <Template
      title="选择曲线指标"
      description="从「我的关注」中最多选 2 项叠在同一时间轴；选 1 项时纵轴更清晰。"
      footer={
        <div className="flex w-full justify-end gap-2">
          <button
            type="button"
            onClick={() => modal.hide()}
            className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px] text-neutral-600 transition-colors hover:bg-neutral-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => {
              onApply(picked);
              modal.hide();
            }}
            className="rounded-lg bg-accent-600 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-accent-700"
          >
            确定（{picked.length}）
          </button>
        </div>
      }
    >
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-neutral-400" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索关注指标"
          className="w-full border border-neutral-200 bg-white py-2.5 pl-8 pr-3 text-[14px] text-neutral-900 placeholder:text-neutral-400 focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100"
        />
      </div>
      <div className="max-h-64 divide-y divide-neutral-100 overflow-y-auto border border-neutral-100">
        {filtered.length === 0 && (
          <p className="px-3 py-6 text-center text-[12px] text-neutral-400">
            没有匹配的关注指标
          </p>
        )}
        {filtered.map((m) => {
          const on = picked.includes(m.code);
          return (
            <button
              key={m.code}
              type="button"
              onClick={() => toggle(m.code)}
              className={cn(
                "flex w-full items-center justify-between px-3 py-2.5 text-left text-[13px] transition-colors hover:bg-neutral-50",
                on ? "text-accent-700" : "text-neutral-800",
              )}
            >
              <span className="truncate">{m.name}</span>
              <span
                className={cn(
                  "ml-2 flex size-4 shrink-0 items-center justify-center rounded-full border text-[10px]",
                  on
                    ? "border-accent-500 bg-accent-500 text-white"
                    : "border-neutral-300 text-transparent",
                )}
              >
                ✓
              </span>
            </button>
          );
        })}
      </div>
    </Template>
  );
}

/* ------------------------------- 主组件 ------------------------------- */

export function WatchCurves({
  series,
  available,
  selected,
  onSelectedChange,
  win,
  onWindowChange,
  granularity,
  onGranularityChange,
  ticks,
}: WatchCurvesProps) {
  const modal = useModal();

  const merged = useMemo(() => {
    const map = new Map<number, Record<string, number>>();
    for (const s of series) {
      for (const p of s.points) {
        const row = map.get(p.t) ?? {};
        row[s.code] = p.v;
        map.set(p.t, row);
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([t, row]) => ({ t, ...row }));
  }, [series]);

  const abnormalByCode = useMemo(() => {
    const out = new Map<string, Map<number, boolean>>();
    for (const s of series) {
      const m = new Map<number, boolean>();
      for (const p of s.points) m.set(p.t, p.abnormal);
      out.set(s.code, m);
    }
    return out;
  }, [series]);

  const handleBrush = (r: { startIndex?: number; endIndex?: number }) => {
    const a = r.startIndex != null ? merged[r.startIndex] : undefined;
    const b = r.endIndex != null ? merged[r.endIndex] : undefined;
    if (a && b) onWindowChange({ start: a.t, end: b.t });
  };

  const hasTwo = series.length >= 2;

  return (
    <div className="card">
      {/* 头部 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <Activity className="size-3.5 text-accent-500" />
          <h2 className="text-[13px] font-semibold text-neutral-900 font-display">
            关注指标趋势
          </h2>
          <span className="font-mono text-[10px] text-neutral-400">
            与泳道共用时间轴
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* 粒度按钮 */}
          <div className="flex items-center gap-1 border border-neutral-200 bg-neutral-100 p-0.5">
            <span className="pl-2 font-mono text-[10px] text-neutral-400">
              <CalendarRange className="inline size-3" />
            </span>
            {([
              { id: "year", label: "按年" },
              { id: "month", label: "按月" },
            ] as const).map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => onGranularityChange(g.id)}
                className={cn(
                  "flex h-[26px] items-center px-2.5 font-mono text-[11px] font-medium tracking-[0.04em] transition-colors",
                  granularity === g.id
                    ? "bg-white text-accent-600 shadow-xs"
                    : "text-neutral-500 hover:text-neutral-900",
                )}
              >
                {g.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              modal.show(
                <MetricPickerModal
                  available={available}
                  selected={selected}
                  onApply={onSelectedChange}
                />,
              )
            }
            className="flex items-center gap-1 text-[11px] font-mono text-neutral-400 transition-colors hover:text-accent-600"
          >
            <SlidersHorizontal className="size-3" />
            选择指标
          </button>
        </div>
      </div>

      {/* 曲线图例 */}
      {series.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-neutral-100 px-4 py-2">
          {series.map((s, i) => {
            const last = s.points[s.points.length - 1];
            return (
              <span key={s.code} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-[3px] w-4 rounded-full"
                  style={{ backgroundColor: LINE_COLORS[i % LINE_COLORS.length] }}
                />
                <span className="text-[11px] font-body text-neutral-700">
                  {s.name}
                </span>
                {s.unit && (
                  <span className="font-mono text-[10px] text-neutral-400">
                    {s.unit}
                  </span>
                )}
                {last && (
                  <span className="font-mono text-[11px] font-semibold tabular-nums text-neutral-900">
                    {last.v}
                  </span>
                )}
                {s.status !== "normal" && <StatusBadge status={s.status} label="异常" />}
              </span>
            );
          })}
        </div>
      )}

      {/* 图表主体 */}
      <div className="px-2 py-3">
        {available.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-[13px] text-neutral-500">
              还没有「我的关注」指标。
            </p>
            <p className="mt-1 font-mono text-[11px] text-neutral-400">
              到「趋势对比 → 我的关注」添加后，这里会自动画出趋势曲线。
            </p>
          </div>
        ) : series.length === 0 || merged.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13px] text-neutral-400">
            所选指标暂无数值记录。
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={hasTwo ? 260 : 230}>
            <LineChart
              data={merged}
              margin={{ top: 8, right: hasTwo ? 48 : 16, bottom: 4, left: 8 }}
            >
              {series.map((s, i) => {
                if (s.refLow == null || s.refHigh == null) return null;
                return (
                  <ReferenceArea
                    key={`ref-${s.code}`}
                    yAxisId={i === 0 ? "left" : "right"}
                    y1={s.refLow}
                    y2={s.refHigh}
                    fill="var(--color-health-normal-bg)"
                    stroke="var(--color-health-normal-border)"
                    strokeDasharray="3 3"
                    fillOpacity={0.4}
                  />
                );
              })}

              <XAxis
                dataKey="t"
                type="number"
                domain={[win.start, win.end]}
                ticks={ticks.map((t) => t.t)}
                tickFormatter={(v: number) => fmtYearMonth(v)}
                tick={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  fill: "var(--color-neutral-400)",
                }}
                axisLine={{ stroke: "var(--color-neutral-200)" }}
                tickLine={false}
                dy={6}
              />

              {series.map((s, i) => (
                <YAxis
                  key={`y-${s.code}`}
                  yAxisId={i === 0 ? "left" : "right"}
                  orientation={i === 0 ? "left" : "right"}
                  width={i === 0 ? 40 : 40}
                  tick={{
                    fontSize: 10,
                    fontFamily: "var(--font-mono)",
                    fill: "var(--color-neutral-400)",
                  }}
                  axisLine={false}
                  tickLine={false}
                />
              ))}

              <Tooltip
                content={(props: unknown) => {
                  const p = props as {
                    active?: boolean;
                    label?: number;
                    payload?: ReadonlyArray<{ dataKey?: string | number; value?: unknown }>;
                  };
                  if (!p.active || !p.payload || p.payload.length === 0) return null;
                  const label = Number(p.label ?? 0);
                  return (
                    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 shadow-md">
                      <p className="font-mono text-[11px] text-neutral-500">
                        {fmtYearMonth(label)}
                      </p>
                      {series.map((s, i) => {
                        const row = p.payload?.find((x) => x.dataKey === s.code);
                        if (!row || row.value == null) return null;
                        const abnormal =
                          abnormalByCode.get(s.code)?.get(label) === true;
                        return (
                          <p
                            key={s.code}
                            className="mt-0.5 flex items-center gap-2 font-mono text-[12px] tabular-nums"
                            style={{
                              color: abnormal
                                ? "var(--color-health-warning)"
                                : "var(--color-neutral-900)",
                            }}
                          >
                            <span
                              className="inline-block size-2 rounded-full"
                              style={{
                                backgroundColor:
                                  LINE_COLORS[i % LINE_COLORS.length],
                              }}
                            />
                            {s.name} {String(row.value)}
                            <span className="text-[10px] text-neutral-400">
                              {s.unit}
                            </span>
                          </p>
                        );
                      })}
                    </div>
                  );
                }}
              />

              {series.map((s, i) => (
                <Line
                  key={s.code}
                  type="monotone"
                  dataKey={s.code}
                  yAxisId={i === 0 ? "left" : "right"}
                  stroke={LINE_COLORS[i % LINE_COLORS.length]}
                  strokeWidth={2}
                  isAnimationActive={false}
                  connectNulls
                  dot={(props: unknown) => {
                    const { cx, cy, index } = props as DotProps;
                    const t = merged[index ?? 0]?.t;
                    const abnormal =
                      t != null && abnormalByCode.get(s.code)?.get(t) === true;
                    const color = abnormal
                      ? "var(--color-health-warning)"
                      : LINE_COLORS[i % LINE_COLORS.length];
                    return (
                      <circle
                        key={`${s.code}-${index ?? 0}`}
                        cx={cx}
                        cy={cy}
                        r={abnormal ? 4.5 : 3}
                        fill={abnormal ? "var(--color-health-warning-bg)" : "white"}
                        stroke={color}
                        strokeWidth={abnormal ? 2.5 : 2}
                      />
                    );
                  }}
                />
              ))}

              {merged.length >= 4 && (
                <Brush
                  dataKey="t"
                  height={22}
                  travellerWidth={8}
                  stroke="var(--color-accent-500)"
                  fill="var(--color-neutral-50)"
                  tickFormatter={(v: number) => fmtYearMonth(v)}
                  onChange={handleBrush}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {merged.length >= 4 && (
        <p className="border-t border-neutral-100 px-4 py-2 font-mono text-[10px] text-neutral-400">
          底部拖动两端的把手可缩小时间范围，泳道与分面小图会同步；色带为参考区间。
        </p>
      )}
    </div>
  );
}
