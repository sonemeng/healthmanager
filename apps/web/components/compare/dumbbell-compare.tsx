"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronDown, ChevronRight, Ruler } from "lucide-react";
import { CATEGORY_META, CATEGORY_ORDER } from "@/lib/biomarker-categories";
import { cn } from "@/lib/utils";
import type { CompareMetricRow } from "./types";

/**
 * 位置对比（哑铃图）：把每个指标的两次结果都映射到「在参考区间中的相对位置」，
 * 横轴不再承载数值本身，因此不同单位的指标可以并排放在一张图里
 * —— 这是双 Y 轴只能放两项的根本解法。
 *
 * 位置定义：0 = 参考下限，1 = 参考上限，越界即异常；区间外按半区间宽截断，
 * 用箭头表示「仍在范围外」，避免个别极端值把其余指标压成一条线。
 */

const POS_MIN = -0.5;
const POS_MAX = 1.5;
const RANGE_LEFT = ((0 - POS_MIN) / (POS_MAX - POS_MIN)) * 100;
const RANGE_WIDTH = ((1 - 0) / (POS_MAX - POS_MIN)) * 100;

function toPercent(pos: number): number {
  const clamped = Math.min(POS_MAX, Math.max(POS_MIN, pos));
  return ((clamped - POS_MIN) / (POS_MAX - POS_MIN)) * 100;
}

/** 距参考区间的距离：区间内为 0，越界取超出量（以区间宽为单位） */
function deviation(pos: number): number {
  if (pos < 0) return -pos;
  if (pos > 1) return pos - 1;
  return 0;
}

function fmtNum(v: number | null, precision: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (precision != null && precision >= 0 && precision <= 6) {
    return v.toFixed(precision);
  }
  return String(Number(v.toFixed(6)));
}

interface CompareRow {
  metric: CompareMetricRow;
  prevPos: number;
  curPos: number;
}

interface DumbbellCompareProps {
  metrics: CompareMetricRow[];
  curDate: string;
  prevDate: string | null;
}

export function DumbbellCompare({
  metrics,
  curDate,
  prevDate,
}: DumbbellCompareProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const byCategory = new Map<string, CompareRow[]>();

    for (const metric of metrics) {
      if (metric.presence !== "both" || metric.unitIncomparable) continue;
      if (metric.value == null || metric.prevValue == null) continue;
      const low = metric.referenceRangeLow;
      const high = metric.referenceRangeHigh;
      if (low == null || high == null || high <= low) continue;

      const span = high - low;
      const row: CompareRow = {
        metric,
        prevPos: (metric.prevValue - low) / span,
        curPos: (metric.value - low) / span,
      };
      const list = byCategory.get(metric.category) ?? [];
      list.push(row);
      byCategory.set(metric.category, list);
    }

    // 组内：偏离参考区间越远越靠前；偏离相同则按变化幅度
    for (const list of byCategory.values()) {
      list.sort((a, b) => {
        const diff = deviation(b.curPos) - deviation(a.curPos);
        if (Math.abs(diff) > 1e-9) return diff;
        return (
          Math.abs(b.curPos - b.prevPos) - Math.abs(a.curPos - a.prevPos)
        );
      });
    }

    const known = new Set<string>(CATEGORY_ORDER);
    const ordered = [
      ...CATEGORY_ORDER,
      ...Array.from(byCategory.keys()).filter((c) => !known.has(c)),
    ];

    return ordered
      .map((category) => ({
        category,
        rows: byCategory.get(category) ?? [],
      }))
      .filter((group) => group.rows.length > 0);
  }, [metrics]);

  const total = groups.reduce((sum, group) => sum + group.rows.length, 0);

  if (total === 0) {
    return (
      <section className="card px-4 py-10 text-center">
        <Ruler className="mx-auto size-5 text-neutral-300" />
        <p className="mt-2 text-[13px] text-neutral-500 font-body">
          本次与上次没有可对比的指标
        </p>
        <p className="mt-1 text-[11px] font-mono text-neutral-400">
          需要同一指标在两次检查中都有数值，且带有参考区间
        </p>
      </section>
    );
  }

  return (
    <section className="card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <Ruler className="size-3.5 text-accent-500" />
          <h2 className="text-[13px] font-semibold text-neutral-900 font-display">
            位置对比
          </h2>
          <span className="bg-neutral-100 px-2 py-0.5 text-[10px] font-mono font-bold text-neutral-500 tabular-nums">
            {total} 项
          </span>
        </div>
        <span className="text-[11px] font-mono text-neutral-400">
          {curDate} vs {prevDate ?? "—"}
        </span>
      </div>

      <div className="border-b border-neutral-100 px-4 py-2">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-neutral-400">
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-[7px] rounded-full border border-neutral-400 bg-white" />
            上次
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-[7px] rounded-full bg-accent-500" />
            本次
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-[7px] w-4 bg-green-50 ring-1 ring-inset ring-green-200" />
            参考区间
          </span>
          <span>越靠右数值越高</span>
        </p>
      </div>

      <div className="divide-y divide-neutral-100">
        {groups.map(({ category, rows }) => {
          const meta = CATEGORY_META[category];
          const Icon = meta?.icon;
          const label = meta?.label ?? category;
          const isCollapsed = collapsed.has(category);

          return (
            <div key={category} className="px-4 py-2">
              <button
                type="button"
                onClick={() =>
                  setCollapsed((prev) => {
                    const next = new Set(prev);
                    if (next.has(category)) next.delete(category);
                    else next.add(category);
                    return next;
                  })
                }
                className="mb-1 flex w-full items-center gap-1.5 py-1 text-left"
              >
                {isCollapsed ? (
                  <ChevronRight className="size-3 text-neutral-400" />
                ) : (
                  <ChevronDown className="size-3 text-neutral-400" />
                )}
                {Icon && <Icon className="size-3.5 text-neutral-400" />}
                <span className="text-[12px] font-medium text-neutral-700 font-body">
                  {label}
                </span>
                <span className="text-[10px] font-mono text-neutral-400 tabular-nums">
                  {rows.length}
                </span>
              </button>

              {!isCollapsed && (
                <div className="min-w-0">
                  {rows.map((row) => (
                    <DumbbellRow key={row.metric.metricCode} row={row} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-neutral-100 px-4 py-2">
        <p className="text-[11px] text-neutral-400 font-body">
          横轴 0 为参考下限、1 为参考上限；超出上下限的部分按半区间宽截断，箭头表示仍在范围外。
        </p>
      </div>
    </section>
  );
}

function DumbbellRow({ row }: { row: CompareRow }) {
  const { metric, prevPos, curPos } = row;
  const prevX = toPercent(prevPos);
  const curX = toPercent(curPos);
  const abnormal = curPos < 0 || curPos > 1;
  const overflowHigh = curPos > POS_MAX;
  const overflowLow = curPos < POS_MIN;
  const low = metric.referenceRangeLow;
  const high = metric.referenceRangeHigh;
  const unit = metric.unit ?? "";

  const title = [
    metric.metricName,
    unit ? `单位 ${unit}` : null,
    low != null && high != null ? `参考 ${low}~${high}` : null,
    abnormal ? "本次异常" : "本次正常",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="flex items-center gap-2 py-[3px]"
      title={title}
    >
      <span className="w-[126px] shrink-0 truncate text-[11px] text-neutral-700 font-body">
        {metric.metricName}
      </span>

      <div className="relative h-5 min-w-0 flex-1">
        <div
          className="absolute inset-y-[5px] bg-green-50"
          style={{ left: `${RANGE_LEFT}%`, width: `${RANGE_WIDTH}%` }}
        />
        <div
          className="absolute inset-y-0 w-px bg-green-200"
          style={{ left: `${RANGE_LEFT}%` }}
        />
        <div
          className="absolute inset-y-0 w-px bg-green-200"
          style={{ left: `${RANGE_LEFT + RANGE_WIDTH}%` }}
        />
        <div
          className="absolute top-1/2 h-px -translate-y-1/2 bg-neutral-300"
          style={{
            left: `${Math.min(prevX, curX)}%`,
            width: `${Math.abs(curX - prevX)}%`,
          }}
        />
        <div
          className="absolute top-1/2 size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-neutral-400 bg-white"
          style={{ left: `${prevX}%` }}
        />
        <div
          className={cn(
            "absolute top-1/2 size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full",
            abnormal ? "bg-[var(--color-health-warning)]" : "bg-accent-500",
          )}
          style={{ left: `${curX}%` }}
        />
        {overflowHigh && (
          <ArrowRight className="absolute top-1/2 right-0 size-3 -translate-y-1/2 text-[var(--color-health-warning)]" />
        )}
        {overflowLow && (
          <ArrowLeft className="absolute top-1/2 left-0 size-3 -translate-y-1/2 text-[var(--color-health-warning)]" />
        )}
      </div>

      <span className="w-[124px] shrink-0 truncate text-right font-mono text-[11px] tabular-nums">
        <span className="text-neutral-400">
          {fmtNum(metric.prevValue, metric.displayPrecision)}
        </span>
        <span className="mx-1 text-neutral-300">→</span>
        <span
          className={cn(
            "font-semibold",
            abnormal
              ? "text-[var(--color-health-warning)]"
              : "text-neutral-900",
          )}
        >
          {fmtNum(metric.value, metric.displayPrecision)}
        </span>
        {unit && (
          <span className="ml-1 text-[10px] font-normal text-neutral-400">
            {unit}
          </span>
        )}
      </span>
    </div>
  );
}
