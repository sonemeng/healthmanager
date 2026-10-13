"use client";

// 批次对比共享视图（spec 20 §3.3，从 compare/page.tsx 原样抽离，渲染逻辑零变化）。
// compare 页与就诊枢纽卡的「前后对比」弹窗（spec 20 §3.3）共用。

import { useMemo } from "react";
import { StatusBadge } from "@/components/health/status-badge";
import { deriveStatus, deriveDirection, getAbnormalityLabel } from "@/lib/health-utils";
import { cn, formatObsValue } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import type { CompareBatch, CompareMetricRow } from "./types";

// 变化幅度格式：+12.3% / -12.3%；绝对值过大收紧小数位
export function formatDeltaPercent(p: number): string {
  const sign = p > 0 ? "+" : "";
  const abs = Math.abs(p);
  const digits = abs >= 1000 ? 0 : 1;
  return `${sign}${p.toFixed(digits)}%`;
}

export function formatDeltaNumber(d: number): string {
  const sign = d > 0 ? "+" : "";
  const abs = Math.abs(d);
  const digits = abs >= 100 ? 1 : 2;
  return `${sign}${d.toFixed(digits)}`;
}

export function valueDisplay(
  row: Pick<
    CompareMetricRow,
    "metricCode" | "value" | "valueText" | "displayPrecision"
  >,
): string {
  if (row.value == null && !row.valueText) return "—";
  return formatObsValue(row.metricCode, row.value, row.valueText, row.displayPrecision);
}

// 变化列：↑红（升）↓绿（降，中国涨跌习惯，不判断好坏）；单位不可比时降级说明
export function DeltaCell({ row }: { row: CompareMetricRow }) {
  if (row.unitIncomparable) {
    return (
      <span className="text-[11px] text-amber-700" title="两次单位不同且无换算规则，无法比较">
        单位不可比
      </span>
    );
  }
  if (row.direction == null || row.delta == null) {
    return <span className="text-[12px] text-neutral-300">—</span>;
  }
  if (row.direction === "flat") {
    return <span className="text-[12px] font-mono text-neutral-400">→ 0%</span>;
  }
  const isUp = row.direction === "up";
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-1 text-[12px] font-mono font-semibold",
        isUp ? "text-red-600" : "text-green-600",
      )}
      title={`较上次 ${formatDeltaNumber(row.delta)}${row.deltaPercent != null ? `（${formatDeltaPercent(row.deltaPercent)}）` : ""}${row.prevUnit !== row.unit ? "（已按字典基准单位换算）" : ""}`}
    >
      <span>{isUp ? "↑" : "↓"}</span>
      {row.deltaPercent != null && (
        <span>{formatDeltaPercent(row.deltaPercent)}</span>
      )}
    </span>
  );
}

export function BatchCard({
  batch,
  isLatest,
  expanded,
  onToggle,
}: {
  batch: CompareBatch;
  isLatest: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const comparableCount = batch.metrics.filter(
    (m) => m.presence === "both" && m.direction != null,
  ).length;
  const newCount = batch.metrics.filter((m) => m.presence === "new").length;
  const missingCount = batch.metrics.filter((m) => m.presence === "missing").length;

  return (
    <div className="card">
      {/* 批次头部：日期 + 距上次天数 + 概要，点击展开/收起 */}
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-neutral-50"
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-[14px] font-semibold tracking-[-0.01em] text-neutral-900">
            {batch.date}
          </span>
          {isLatest && (
            <span className="rounded-full bg-accent-50 px-2 py-0.5 text-[10px] font-medium text-accent-700">
              最新
            </span>
          )}
          {batch.daysSincePrev != null && (
            <span className="text-[11px] text-neutral-400 font-mono">
              距上次 {batch.daysSincePrev} 天
            </span>
          )}
          <span className="text-[11px] text-neutral-400 font-mono">
            {batch.metrics.length} 项
            {comparableCount > 0 && ` · ${comparableCount} 项可比`}
            {newCount > 0 && ` · ${newCount} 项新增`}
            {missingCount > 0 && ` · ${missingCount} 项消失`}
          </span>
        </div>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-neutral-400 transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>

      {expanded && (
        <div className="overflow-x-auto border-t border-neutral-100">
          <div className="min-w-[680px]">
            {/* 表头 */}
            <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1fr)_auto] gap-x-4 border-b border-neutral-100 bg-neutral-50 px-5 py-2">
              {["指标", "本次", "上次", "变化", "状态"].map((h) => (
                <div
                  key={h}
                  className="text-[10px] font-semibold uppercase tracking-[0.06em] text-neutral-400 font-mono last:text-right"
                >
                  {h}
                </div>
              ))}
            </div>
            {batch.metrics.map((row) => {
              const healthStatus = deriveStatus(row);
              return (
                <div
                  key={row.metricCode}
                  className={cn(
                    "grid grid-cols-[minmax(0,1.6fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1fr)_auto] items-center gap-x-4 border-b border-neutral-100 px-5 py-2.5 transition-colors last:border-b-0",
                    row.isAbnormal && "bg-[var(--color-health-warning-bg)]/40",
                  )}
                >
                  {/* 指标名 + 徽标 */}
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span
                      className="truncate text-[13px] font-medium text-neutral-900"
                      title={row.metricName}
                    >
                      {row.metricName}
                    </span>
                    {row.presence === "new" && (
                      <span className="shrink-0 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                        新增
                      </span>
                    )}
                    {row.presence === "missing" && (
                      <span className="shrink-0 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500">
                        消失
                      </span>
                    )}
                  </div>
                  {/* 本次值 */}
                  <div className="flex items-baseline gap-1">
                    <span
                      className={cn(
                        "text-[13px] font-semibold font-mono tabular-nums",
                        row.isAbnormal
                          ? healthStatus === "critical"
                            ? "text-[var(--color-health-critical)]"
                            : "text-[var(--color-health-warning)]"
                          : "text-neutral-900",
                      )}
                    >
                      {row.presence === "missing"
                        ? "—"
                        : valueDisplay(row)}
                    </span>
                    {row.presence !== "missing" && row.unit && (
                      <span className="text-[10px] text-neutral-400 font-mono">
                        {row.unit}
                      </span>
                    )}
                  </div>
                  {/* 上次值 */}
                  <div className="flex items-baseline gap-1">
                    <span className="text-[13px] font-mono tabular-nums text-neutral-500">
                      {row.prevDate
                        ? row.prevValue != null
                          ? valueDisplay({
                              metricCode: row.metricCode,
                              value: row.prevValue,
                              valueText: row.prevValueText,
                              displayPrecision: row.displayPrecision,
                            })
                          : (row.prevValueText ?? "—")
                        : "—"}
                    </span>
                    {row.prevDate && row.prevUnit && (
                      <span className="text-[10px] text-neutral-400 font-mono">
                        {row.prevUnit}
                      </span>
                    )}
                  </div>
                  {/* 变化 */}
                  <div>
                    <DeltaCell row={row} />
                  </div>
                  {/* 异常状态（沿用现有 StatusBadge 口径） */}
                  <div className="flex justify-end">
                    {row.presence === "missing" ? (
                      <span className="text-[11px] text-neutral-300 font-mono">—</span>
                    ) : row.isAbnormal ? (
                      <StatusBadge
                        status={healthStatus}
                        label={getAbnormalityLabel(healthStatus, deriveDirection(row))}
                      />
                    ) : (
                      <StatusBadge status="normal" label="正常" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// 历年总表：行=指标，列=检查日期（旧 → 新），缺失格显示「—」
export function BatchTable({ batches }: { batches: CompareBatch[] }) {
  const datesAsc = useMemo(
    () => batches.map((b) => b.date).reverse(),
    [batches],
  );

  const rows = useMemo(() => {
    // metricCode → { name, meta, cells: date → metric row }
    const map = new Map<
      string,
      {
        metricCode: string;
        metricName: string;
        category: string;
        sortOrder: number | null;
        displayPrecision: number | null;
        cells: Map<string, CompareMetricRow>;
      }
    >();
    for (const batch of batches) {
      for (const m of batch.metrics) {
        const entry = map.get(m.metricCode) ?? {
          metricCode: m.metricCode,
          metricName: m.metricName,
          category: m.category,
          sortOrder: m.sortOrder ?? null,
          displayPrecision: m.displayPrecision,
          cells: new Map<string, CompareMetricRow>(),
        };
        entry.cells.set(batch.date, m);
        map.set(m.metricCode, entry);
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      const cat = a.category.localeCompare(b.category);
      if (cat !== 0) return cat;
      const so = (a.sortOrder ?? 1e9) - (b.sortOrder ?? 1e9);
      if (so !== 0) return so;
      return a.metricName.localeCompare(b.metricName, "zh");
    });
  }, [batches]);

  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse">
        <thead>
          <tr className="border-b border-neutral-200 bg-neutral-50">
            <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-neutral-400 font-mono">
              指标
            </th>
            {datesAsc.map((d) => (
              <th
                key={d}
                className="whitespace-nowrap px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.06em] text-neutral-400 font-mono"
              >
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.metricCode}
              className="border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50/60"
            >
              <td
                className="max-w-[220px] truncate px-4 py-2.5 text-[13px] font-medium text-neutral-900"
                title={r.metricName}
              >
                {r.metricName}
              </td>
              {datesAsc.map((d) => {
                const cell = r.cells.get(d);
                if (!cell) {
                  return (
                    <td
                      key={d}
                      className="px-4 py-2.5 text-right text-[12px] text-neutral-300 font-mono"
                    >
                      —
                    </td>
                  );
                }
                const healthStatus = deriveStatus(cell);
                return (
                  <td
                    key={d}
                    className={cn(
                      "whitespace-nowrap px-4 py-2.5 text-right text-[12px] font-mono tabular-nums",
                      cell.isAbnormal
                        ? healthStatus === "critical"
                          ? "font-semibold text-[var(--color-health-critical)]"
                          : "font-semibold text-[var(--color-health-warning)]"
                        : "text-neutral-700",
                    )}
                  >
                    {valueDisplay(cell)}
                    {cell.unit && (
                      <span className="ml-1 text-[10px] text-neutral-400">
                        {cell.unit}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
