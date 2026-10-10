"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { StatusBadge } from "@/components/health/status-badge";
import { TrendChart } from "@/components/health/trend-chart";
import { MiniSparkline } from "@/components/health/mini-sparkline";
import { deriveStatus } from "@/lib/health-utils";
import { cn, formatObsValue } from "@/lib/utils";
import { X, ShieldAlert, CircleAlert } from "lucide-react";
import type { CompareBatch } from "./page";
import { DietPlanView } from "./diet-plan-view";

// 健康大屏（spec 17 §1）：关注指标卡片墙 + AI 饮食建议入口。
// 患者视角（大数字/红绿灯/箭头/迷你趋势线），参考区间进悬浮提示。

export function DashboardScreen({ batches }: { batches: CompareBatch[] }) {
  const utils = trpc.useUtils();
  const { data: dashData } = trpc.dashboardMetrics.list.useQuery();
  const { data: metricsData } = trpc.metrics.list.useQuery();

  const addMutation = trpc.dashboardMetrics.add.useMutation({
    onSuccess: () => utils.dashboardMetrics.list.invalidate(),
  });
  const removeMutation = trpc.dashboardMetrics.remove.useMutation({
    onSuccess: () => utils.dashboardMetrics.list.invalidate(),
  });

  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [addingCode, setAddingCode] = useState("");

  const saved = dashData?.saved ?? [];
  const suggested = dashData?.suggested ?? [];
  const savedCount = dashData?.savedCount ?? 0;

  // 最新批次指标行索引（时间升序批次列表供趋势图用）
  const batchesAsc = useMemo(() => [...batches].reverse(), [batches]);

  const latestByName = useMemo(() => {
    const map = new Map<string, (typeof batches)[number]["metrics"][number]>();
    for (const m of batches[0]?.metrics ?? []) map.set(m.metricCode, m);
    return map;
  }, [batches]);

  // 该指标的历次数据点（正序）
  const historyFor = (code: string) =>
    batchesAsc
      .map((b) => {
        const row = b.metrics.find((m) => m.metricCode === code);
        return row && row.value != null ? { date: b.date, value: row.value } : null;
      })
      .filter((p): p is { date: string; value: number } => p !== null);

  const saveSuggested = () => {
    for (const s of suggested) addMutation.mutate({ metricCode: s.metricCode });
  };

  return (
    <div className="space-y-6">
      {/* 关注指标卡片墙 */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-neutral-700 font-body">
            我的关注指标
            <span className="ml-2 text-[11px] text-neutral-400 font-mono">
              点击卡片看趋势
            </span>
          </h2>
          <div className="flex items-center gap-2">
            <select
              value={addingCode}
              onChange={(e) => {
                const code = e.target.value;
                if (code) {
                  addMutation.mutate({ metricCode: code });
                  setAddingCode("");
                }
              }}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[12px] text-neutral-700 focus:border-accent-300 focus:outline-none"
            >
              <option value="">+ 添加关注指标…</option>
              {(metricsData ?? [])
                .filter((m) => !saved.some((s) => s.metricCode === m.id))
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {/* 预填引导：首次使用（无保存记录）且存在建议 */}
        {savedCount === 0 && suggested.length > 0 && (
          <div className="card mb-3 border-amber-200 bg-amber-50/60 px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-amber-900">
                  根据最新一次检查（{batches[0]?.date}），建议关注以下{" "}
                  {suggested.length} 项
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {suggested.map((s) => (
                    <span
                      key={s.metricCode}
                      className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-white px-2 py-0.5 text-[11px] text-neutral-700"
                    >
                      {s.metricName}
                      <span
                        className={cn(
                          "font-mono text-[10px]",
                          s.reason === "异常"
                            ? "text-[var(--color-health-critical)]"
                            : "text-amber-600",
                        )}
                      >
                        {s.reason === "异常" ? (
                          <ShieldAlert className="size-3" />
                        ) : (
                          <CircleAlert className="size-3" />
                        )}
                        {s.reason}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
              <button
                onClick={saveSuggested}
                disabled={addMutation.isPending}
                className="shrink-0 rounded-lg bg-amber-600 px-3.5 py-2 text-[12px] font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
              >
                保存为我的关注
              </button>
            </div>
          </div>
        )}

        {/* 卡片墙 */}
        {savedCount === 0 && suggested.length === 0 ? (
          <div className="card px-5 py-10 text-center text-[13px] text-neutral-400">
            还没有关注指标，点右上角「+ 添加关注指标」开始。
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {saved.map((s) => {
              const row = latestByName.get(s.metricCode);
              const metricName =
                row?.metricName ??
                (metricsData ?? []).find((m) => m.id === s.metricCode)?.name ??
                s.metricCode;
              const points = historyFor(s.metricCode);
              const healthStatus = row ? deriveStatus(row) : "normal";
              const rangeText =
                row?.referenceRangeLow != null && row?.referenceRangeHigh != null
                  ? `参考 ${row.referenceRangeLow}–${row.referenceRangeHigh}${row.unit ? " " + row.unit : ""}`
                  : "无参考区间";
              const isExpanded = expandedCode === s.metricCode;

              return (
                <div key={s.metricCode} className="card overflow-hidden">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setExpandedCode(isExpanded ? null : s.metricCode)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") setExpandedCode(isExpanded ? null : s.metricCode);
                    }}
                    title={rangeText}
                    className="cursor-pointer px-4 pt-3.5 pb-2 transition-colors hover:bg-neutral-50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className="truncate text-[13px] font-medium text-neutral-900"
                        title={metricName}
                      >
                        {metricName}
                      </span>
                      <div className="flex shrink-0 items-center gap-1">
                        <StatusBadge
                          status={row ? healthStatus : "neutral"}
                          label={row ? (row.isAbnormal ? (healthStatus === "critical" ? "严重异常" : "异常") : "正常") : "无数据"}
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeMutation.mutate({ metricCode: s.metricCode });
                          }}
                          disabled={removeMutation.isPending}
                          className="rounded p-0.5 text-neutral-300 transition-colors hover:bg-neutral-100 hover:text-neutral-500"
                          title="取消关注"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* 最新值大字 + 与上次对比 */}
                    <div className="mt-1.5 flex items-end justify-between gap-2">
                      <div className="flex items-baseline gap-1">
                        <span
                          className={cn(
                            "text-[26px] font-medium tracking-[-0.02em] font-display tabular-nums",
                            row?.isAbnormal
                              ? healthStatus === "critical"
                                ? "text-[var(--color-health-critical)]"
                                : "text-[var(--color-health-warning)]"
                              : "text-neutral-900",
                          )}
                        >
                          {row ? formatObsValue(s.metricCode, row.value, row.valueText, row.displayPrecision) : "—"}
                        </span>
                        {row?.unit && (
                          <span className="text-[11px] text-neutral-400 font-mono">
                            {row.unit}
                          </span>
                        )}
                      </div>
                      {row?.direction != null && row.unitIncomparable === false && row.deltaPercent != null && (
                        <span
                          className={cn(
                            "font-mono text-[11px] font-semibold",
                            row.direction === "up" ? "text-red-600" : row.direction === "down" ? "text-green-600" : "text-neutral-400",
                          )}
                        >
                          {row.direction === "up" ? "↑" : row.direction === "down" ? "↓" : "→"}
                          {row.deltaPercent > 0 ? "+" : ""}
                          {Math.abs(row.deltaPercent) >= 1000 ? row.deltaPercent.toFixed(0) : row.deltaPercent.toFixed(1)}%
                        </span>
                      )}
                    </div>

                    {/* 迷你趋势线（复用现成 MiniSparkline；仅一次检查时提示） */}
                    <div className="mt-1">
                      {points.length >= 2 ? (
                        <MiniSparkline
                          data={points.map((p) => p.value)}
                          color={row?.isAbnormal ? "var(--color-health-warning)" : "var(--color-health-normal)"}
                        />
                      ) : (
                        <span className="text-[10px] text-neutral-300 font-mono">
                          仅一次检查
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 原地展开：趋势大图 + 最近两次对比 */}
                  {isExpanded && (
                    <div className="border-t border-neutral-100 bg-neutral-50/60 px-4 py-3">
                      {points.length > 0 ? (
                        <div className="h-56">
                          <TrendChart
                            data={points.map((p) => ({ date: p.date, value: p.value, unit: row?.unit ?? null }))}
                            referenceRangeLow={row?.referenceRangeLow ?? null}
                            referenceRangeHigh={row?.referenceRangeHigh ?? null}
                            unit={row?.unit ?? null}
                            status={healthStatus}
                          />
                        </div>
                      ) : (
                        <p className="py-4 text-center text-[12px] text-neutral-400">
                          该指标暂无数值记录。
                        </p>
                      )}
                      {row && row.prevDate && (
                        <p className="mt-2 text-[11px] text-neutral-500 font-mono">
                          上次（{row.prevDate}）：{row.prevValue != null ? formatObsValue(s.metricCode, row.prevValue, row.prevValueText, row.displayPrecision) : (row.prevValueText ?? "—")}
                          {row.prevUnit ? ` ${row.prevUnit}` : ""}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* AI 饮食建议 */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-neutral-700 font-body">
            AI 饮食建议
          </h2>
          <span className="text-[11px] text-neutral-400 font-mono">
            结合最新检查指标、在用药物与过敏史生成
          </span>
        </div>
        <DietPlanView />
      </section>
    </div>
  );
}
