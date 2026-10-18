"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceArea,
} from "recharts";
import {
  Activity,
  CalendarRange,
  SlidersHorizontal,
  Search,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  MoveHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useModal } from "@/components/modal/provider";
import { Template } from "@/components/modal/template";
import {
  fmtYearMonth,
  panWindow,
  seriesValueAxis,
  zoomWindow,
  type Granularity,
  type MetricSeries,
  type Tick,
  type TimeWindow,
} from "./derive";

// ---------------------------------------------------------------------------
// 时间线 C（spec 18 §1）+ 分面小图（§2）：关注指标曲线（与泳道共用时间轴）
// 交互：Ctrl+滚轮缩放（锚点为鼠标位置）、按住左键拖动平移、双击还原；
// 全部通过改写页面级 TimeWindow 实现，泳道与分面小图随之同步。
// ---------------------------------------------------------------------------

const LINE_COLORS = ["var(--color-accent-500)", "#0d9488"];

export const SERIES_COLORS = LINE_COLORS;

/** 与「按年 / 按月」粒度按钮同高（26px）的图标按钮，保持头部一排控件齐平 */
const ZOOM_BTN_CLASS =
  "flex h-[26px] w-[26px] items-center justify-center text-neutral-500 transition-colors hover:text-accent-600 disabled:pointer-events-none disabled:text-neutral-300";

interface WatchCurvesProps {
  series: MetricSeries[];
  available: { code: string; name: string }[];
  selected: string[];
  onSelectedChange: (codes: string[]) => void;
  /** 当前可见窗口（页面级状态，泳道与分面小图共用） */
  win: TimeWindow;
  /** 全部数据的时间范围，缩放/平移的硬边界，也是「还原」的目标 */
  domain: TimeWindow;
  onWindowChange: (w: TimeWindow) => void;
  /** 还原到全量时间范围（等价于清除自定义窗口） */
  onResetWindow: () => void;
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
  domain,
  onWindowChange,
  onResetWindow,
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

  const hasTwo = series.length >= 2;

  /* ----------------------------- 缩放与平移 ----------------------------- */

  const plotRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; win: TimeWindow } | null>(null);
  const [dragging, setDragging] = useState(false);

  // 用 ref 持有最新值：滚轮监听只挂一次，不必随每次窗口变化重挂
  const winRef = useRef(win);
  winRef.current = win;
  const domainRef = useRef(domain);
  domainRef.current = domain;
  const changeRef = useRef(onWindowChange);
  changeRef.current = onWindowChange;

  // 数据未就绪时图表容器不渲染，监听也必须等到容器出现后再挂（否则一次都不挂）
  const chartReady = available.length > 0 && series.length > 0 && merged.length > 0;

  // 只在按住 Ctrl/⌘ 时接管滚轮，普通滚轮照常滚动页面，避免图表把整页滚动劫走
  useEffect(() => {
    if (!chartReady) return;
    const el = plotRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const anchor = (e.clientX - rect.left) / Math.max(1, rect.width);
      const factor = e.deltaY > 0 ? 1.25 : 0.8;
      changeRef.current(zoomWindow(winRef.current, domainRef.current, anchor, factor));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [chartReady]);

  // 按住左键拖动平移；每次都以按下时的窗口为基准算位移，不会累积漂移
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = plotRef.current;
    if (!el) return;
    dragRef.current = { x: e.clientX, win: winRef.current };
    setDragging(true);
    el.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const st = dragRef.current;
    const el = plotRef.current;
    if (!st || !el) return;
    const width = el.getBoundingClientRect().width || 1;
    changeRef.current(
      panWindow(st.win, domainRef.current, (st.x - e.clientX) / width),
    );
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = plotRef.current;
    if (dragRef.current && el?.hasPointerCapture(e.pointerId)) {
      el.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
    setDragging(false);
  };

  /** 以中心为锚点缩放；factor > 1 看更宽，< 1 看更细 */
  const zoomBy = (factor: number) =>
    onWindowChange(zoomWindow(win, domain, 0.5, factor));

  const isFullSpan = win.end - win.start >= domain.end - domain.start - 1;

  // 纵轴只按各序列自身数值范围伸缩（参考区间不参与），顶点上方固定留一整格
  const valueAxes = useMemo(() => series.map(seriesValueAxis), [series]);

  // 放大后可能落到两个采样点之间（检验不是每天都做），空窗口要给出说明，别让人以为数据丢了
  const winPointCount = useMemo(
    () => merged.filter((r) => r.t >= win.start && r.t <= win.end).length,
    [merged, win],
  );

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
          {/* 缩放：与粒度按钮同高同容器样式 */}
          <div className="flex items-center gap-1 border border-neutral-200 bg-neutral-100 p-0.5">
            <button
              type="button"
              onClick={() => zoomBy(0.7)}
              className={ZOOM_BTN_CLASS}
              title="放大时间轴"
              aria-label="放大时间轴"
            >
              <ZoomIn className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => zoomBy(1.4)}
              className={ZOOM_BTN_CLASS}
              title="缩小时间轴"
              aria-label="缩小时间轴"
            >
              <ZoomOut className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={onResetWindow}
              disabled={isFullSpan}
              className={ZOOM_BTN_CLASS}
              title={isFullSpan ? "已是全部时间范围" : "还原全部时间范围"}
              aria-label="还原全部时间范围"
            >
              <RotateCcw className="size-3.5" />
            </button>
          </div>
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

      {/* 曲线图例：只留颜色与指标名。数值 / 参考区间 / 异常状态移到悬浮提示里
          （2026-10-18 用户口径：图例不要再堆单位与参考值） */}
      {series.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-neutral-100 px-4 py-2">
          {series.map((s, i) => (
            <span key={s.code} className="flex items-center gap-1.5">
              <span
                className="inline-block h-[3px] w-4 rounded-full"
                style={{ backgroundColor: LINE_COLORS[i % LINE_COLORS.length] }}
              />
              <span className="text-[11px] font-body text-neutral-700">{s.name}</span>
            </span>
          ))}
          <span className="ml-auto font-mono text-[10px] text-neutral-400">
            鼠标悬浮曲线查看数值与参考区间
          </span>
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
          <div
            ref={plotRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onDoubleClick={onResetWindow}
            className={cn("relative select-none", dragging ? "cursor-grabbing" : "cursor-grab")}
            style={{ touchAction: "none" }}
          >
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
                  /* 必须开：recharts 默认会把用户 domain 与数据全量域取并集
                     （isDomainSpecifiedByUser.js extendDomain），不开关就永远缩不进去 */
                  allowDataOverflow
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

                {series.map((s, i) => {
                  const axis = valueAxes[i];
                  return (
                    <YAxis
                      key={`y-${s.code}`}
                      yAxisId={i === 0 ? "left" : "right"}
                      orientation={i === 0 ? "left" : "right"}
                      width={40}
                      /* 显式给 domain + ticks：刻度线就是算法算出的整刻度，
                         数据顶点上方固定留一整格，屏幕上的一格 = 算法里的一格 */
                      domain={axis?.domain ?? [0, 1]}
                      ticks={axis && axis.ticks.length > 1 ? axis.ticks : undefined}
                      tick={{
                        fontSize: 10,
                        fontFamily: "var(--font-mono)",
                        fill: "var(--color-neutral-400)",
                      }}
                      axisLine={false}
                      tickLine={false}
                    />
                  );
                })}

                {/* 拖拽平移时收起悬停提示，避免提示框跟着手跑。
                    数值 / 单位 / 参考区间 / 异常状态都在这里给（图例只留名字）。 */}
                {!dragging && (
                  <Tooltip
                    cursor={{
                      stroke: "var(--color-neutral-300)",
                      strokeDasharray: "3 3",
                    }}
                    content={(props: unknown) => {
                      const p = props as {
                        active?: boolean;
                        label?: number;
                        payload?: ReadonlyArray<{
                          dataKey?: string | number;
                          value?: unknown;
                        }>;
                      };
                      if (!p.active || !p.payload || p.payload.length === 0) {
                        return null;
                      }
                      const label = Number(p.label ?? 0);
                      return (
                        <div className="min-w-[172px] rounded-lg border border-neutral-200 bg-white px-3 py-2 shadow-md">
                          <p className="font-mono text-[11px] text-neutral-500">
                            {fmtYearMonth(label)}
                          </p>
                          {series.map((s, i) => {
                            const row = p.payload?.find(
                              (x) => x.dataKey === s.code,
                            );
                            if (!row || row.value == null) return null;
                            const abnormal =
                              abnormalByCode.get(s.code)?.get(label) === true;
                            const ref =
                              s.refLow != null && s.refHigh != null
                                ? `参考 ${s.refLow}~${s.refHigh}`
                                : s.refHigh != null
                                  ? `参考 ≤ ${s.refHigh}`
                                  : s.refLow != null
                                    ? `参考 ≥ ${s.refLow}`
                                    : null;
                            return (
                              <div key={s.code} className="mt-1.5">
                                <p className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                                  <span
                                    className="inline-block size-2 rounded-full"
                                    style={{
                                      backgroundColor:
                                        LINE_COLORS[i % LINE_COLORS.length],
                                    }}
                                  />
                                  {s.name}
                                </p>
                                <p className="flex items-baseline gap-1 pl-3.5">
                                  <span
                                    className="font-mono text-[13px] font-semibold tabular-nums"
                                    style={{
                                      color: abnormal
                                        ? "var(--color-health-warning)"
                                        : "var(--color-neutral-900)",
                                    }}
                                  >
                                    {String(row.value)}
                                  </span>
                                  {s.unit && (
                                    <span className="font-mono text-[10px] text-neutral-400">
                                      {s.unit}
                                    </span>
                                  )}
                                </p>
                                <p className="flex items-center gap-1.5 pl-3.5 font-mono text-[10px] text-neutral-400">
                                  {ref && <span>{ref}</span>}
                                  <span
                                    className={
                                      abnormal
                                        ? "font-medium text-[var(--color-health-warning)]"
                                        : "text-neutral-400"
                                    }
                                  >
                                    {abnormal ? "异常" : "正常"}
                                  </span>
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      );
                    }}
                  />
                )}

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
                      const row = merged[index ?? 0];
                      /* 该日期只有另一条曲线有数据时，本系列的点值是 undefined，
                         recharts 仍回调并给出 cy=0，会画出贴在顶边的假点 —— 必须挡掉 */
                      if (
                        !row ||
                        (row as Record<string, number | undefined>)[s.code] == null ||
                        cy == null
                      ) {
                        return null;
                      }
                      const t = row.t;
                      const abnormal =
                        abnormalByCode.get(s.code)?.get(t) === true;
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

                </LineChart>
            </ResponsiveContainer>

            {winPointCount === 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <p className="rounded-lg border border-neutral-200 bg-white/95 px-3 py-1.5 text-[12px] text-neutral-500 shadow-sm">
                  当前范围内没有记录，拖动平移或双击还原
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {series.length > 0 && merged.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-neutral-100 px-4 py-2 font-mono text-[10px] text-neutral-400">
          <span className="inline-flex items-center gap-1">
            <MoveHorizontal className="size-3" />
            按住左键拖动平移
          </span>
          <span>Ctrl + 滚轮缩放</span>
          <span>双击还原</span>
          <span>色带为参考区间，超出纵轴范围时不绘制；纵轴按数值范围自适应</span>
        </p>
      )}
    </div>
  );
}
