"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { AnimatedEmptyState } from "@/components/animated-empty-state";
import {
  StatusBadge,
} from "@/components/health/status-badge";
import { deriveStatus, deriveDirection, getAbnormalityLabel } from "@/lib/health-utils";
import { cn, formatObsValue } from "@/lib/utils";
import {
  ChevronDown,
  Table2,
  LayoutList,
} from "lucide-react";

type CompareMetricRow = {
  metricCode: string;
  metricName: string;
  category: string;
  sortOrder: number | null;
  displayPrecision: number | null;
  value: number | null;
  valueText: string | null;
  unit: string | null;
  isAbnormal: boolean | null;
  referenceRangeLow: number | null;
  referenceRangeHigh: number | null;
  presence: "both" | "new" | "missing";
  prevDate: string | null;
  prevValue: number | null;
  prevUnit: string | null;
  prevValueText: string | null;
  delta: number | null;
  deltaPercent: number | null;
  direction: "up" | "down" | "flat" | null;
  unitIncomparable: boolean;
};

type CompareBatch = {
  date: string;
  daysSincePrev: number | null;
  metrics: CompareMetricRow[];
};

// 变化幅度格式：+12.3% / -12.3%；绝对值过大收紧小数位
function formatDeltaPercent(p: number): string {
  const sign = p > 0 ? "+" : "";
  const abs = Math.abs(p);
  const digits = abs >= 1000 ? 0 : 1;
  return `${sign}${p.toFixed(digits)}%`;
}

function formatDeltaNumber(d: number): string {
  const sign = d > 0 ? "+" : "";
  const abs = Math.abs(d);
  const digits = abs >= 100 ? 1 : 2;
  return `${sign}${d.toFixed(digits)}`;
}

function valueDisplay(
  row: Pick<
    CompareMetricRow,
    "metricCode" | "value" | "valueText" | "displayPrecision"
  >,
): string {
  if (row.value == null && !row.valueText) return "—";
  return formatObsValue(row.metricCode, row.value, row.valueText, row.displayPrecision);
}

// 变化列：↑红（升）↓绿（降，中国涨跌习惯，不判断好坏）；单位不可比时降级说明
function DeltaCell({ row }: { row: CompareMetricRow }) {
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

function BatchCard({
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
function BatchTable({ batches }: { batches: CompareBatch[] }) {
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

export default function ComparePage() {
  const { data, isLoading } = trpc.observations.compareBatches.useQuery();
  const batches = data?.batches;

  const [view, setView] = useState<"blocks" | "table">("blocks");
  // null = 用户尚未定制 → 默认展开最新一次（派生状态，不用 effect）
  const [customExpanded, setCustomExpanded] = useState<Set<number> | null>(null);
  const expanded = useMemo(
    () => customExpanded ?? new Set<number>([0]),
    [customExpanded],
  );

  const toggle = (index: number) => {
    setCustomExpanded(() => {
      const next = new Set(customExpanded ?? [0]);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div>
        <div className="mb-6 flex items-center justify-between">
          <div className="card h-8 w-48 animate-pulse bg-neutral-50" />
          <div className="card h-9 w-36 animate-pulse bg-neutral-50" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card h-24 animate-pulse bg-neutral-50" />
          ))}
        </div>
      </div>
    );
  }

  if (!batches || batches.length === 0) {
    return (
      <AnimatedEmptyState
        title="暂无检查数据"
        description="上传检验报告后，这里会自动按检查日期汇总，逐项对比每次检查的变化。"
        cardContent={({ icon: Icon }) => (
          <>
            <div className="flex size-7 items-center justify-center card">
              <Icon className="size-4 text-neutral-400" />
            </div>
            <div className="h-2.5 w-28 min-w-0 bg-neutral-100" />
          </>
        )}
      />
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[24px] font-display font-medium tracking-[-0.03em] text-neutral-900">
            趋势对比
          </h1>
          <p className="mt-1 text-[13px] text-neutral-500 font-body">
            同一天视为一次检查；每次与紧邻的上一次对比。
            <span className="ml-2 text-neutral-400">
              <span className="font-mono text-red-600">↑ 升高</span>
              <span className="mx-1 text-neutral-300">/</span>
              <span className="font-mono text-green-600">↓ 降低</span>
              （仅示方向，不代表好坏）
            </span>
          </p>
        </div>
        {/* 双视图切换：只有一次检查时隐藏总表视图 */}
        {batches.length > 1 && (
          <div className="flex items-center gap-1 border border-neutral-200 bg-neutral-100 p-0.5">
            <button
              onClick={() => setView("blocks")}
              className={cn(
                "flex h-[30px] items-center gap-1.5 px-3 font-mono text-[11px] font-medium uppercase tracking-[0.04em] transition-colors",
                view === "blocks"
                  ? "bg-white text-accent-600 shadow-xs"
                  : "text-neutral-500 hover:text-neutral-900",
              )}
            >
              <LayoutList className="size-3.5" />
              批次对比
            </button>
            <button
              onClick={() => setView("table")}
              className={cn(
                "flex h-[30px] items-center gap-1.5 px-3 font-mono text-[11px] font-medium uppercase tracking-[0.04em] transition-colors",
                view === "table"
                  ? "bg-white text-accent-600 shadow-xs"
                  : "text-neutral-500 hover:text-neutral-900",
              )}
            >
              <Table2 className="size-3.5" />
              历年总表
            </button>
          </div>
        )}
      </div>

      {view === "blocks" ? (
        <div className="space-y-3">
          {batches.map((batch, i) => (
            <BatchCard
              key={batch.date}
              batch={batch}
              isLatest={i === 0}
              expanded={expanded.has(i)}
              onToggle={() => toggle(i)}
            />
          ))}
        </div>
      ) : (
        <BatchTable batches={batches} />
      )}
    </div>
  );
}
