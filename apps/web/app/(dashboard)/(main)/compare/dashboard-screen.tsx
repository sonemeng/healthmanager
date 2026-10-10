"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useModal } from "@/components/modal/provider";
import { Template } from "@/components/modal/template";
import { StatusBadge } from "@/components/health/status-badge";
import { TrendChart } from "@/components/health/trend-chart";
import { MiniSparkline } from "@/components/health/mini-sparkline";
import { deriveStatus, deriveDirection, getAbnormalityLabel } from "@/lib/health-utils";
import { cn, formatObsValue } from "@/lib/utils";
import {
  Plus,
  X,
  ChevronDown,
  Star,
  ShieldAlert,
  CircleAlert,
  Search,
} from "lucide-react";
import type { CompareBatch } from "./page";
import { DietPlanView } from "./diet-plan-view";

// 我的关注（spec 17 §1）：样式对齐全站「需要关注」列表行模式
// （components/home/attention-metrics.tsx 同构），不再使用卡片墙。

const statusColor: Record<string, string> = {
  normal: "var(--color-health-normal)",
  warning: "var(--color-health-warning)",
  critical: "var(--color-health-critical)",
};

const inputClass =
  "w-full border border-neutral-200 bg-white px-3 py-2.5 text-[14px] text-neutral-900 placeholder:text-neutral-400 focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100 transition-all";

// 添加关注指标选择器（搜索 + 列表，全站 modal 风格）
function AddMetricModal({
  candidates,
  onPick,
}: {
  candidates: Array<{ id: string; name: string }>;
  onPick: (code: string) => void;
}) {
  const modal = useModal();
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates.slice(0, 80);
    return candidates.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 80);
  }, [candidates, query]);

  return (
    <Template
      title="添加关注指标"
      description="搜索并选择要关注的指标，列表中将持续显示它的最新值与变化。"
    >
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-neutral-400" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索指标名，如「血糖」「肌酐」"
          className={cn(inputClass, "pl-8")}
        />
      </div>
      <div className="max-h-64 divide-y divide-neutral-100 overflow-y-auto border border-neutral-100">
        {filtered.length === 0 && (
          <p className="px-3 py-6 text-center text-[12px] text-neutral-400">
            没有匹配的指标
          </p>
        )}
        {filtered.map((m) => (
          <button
            key={m.id}
            onClick={() => {
              onPick(m.id);
              modal.hide();
            }}
            className="block w-full px-3 py-2.5 text-left text-[13px] text-neutral-800 transition-colors hover:bg-neutral-50"
          >
            {m.name}
            <span className="ml-2 text-[10px] font-mono text-neutral-400">{m.id}</span>
          </button>
        ))}
      </div>
    </Template>
  );
}

// 历次记录列表：数据点少（1–2 次）时比折线图更直白
function RecordList({
  code,
  unit,
  batchesAsc,
  displayPrecision,
}: {
  code: string;
  unit: string | null;
  batchesAsc: CompareBatch[];
  displayPrecision: number | null;
}) {
  const rows = batchesAsc.flatMap((b) => {
    const row = b.metrics.find((m) => m.metricCode === code);
    if (!row || (row.value == null && !row.valueText)) return [];
    return [
      {
        date: b.date,
        value: row.value,
        valueText: row.valueText,
        unit: row.unit ?? unit,
        isAbnormal: row.isAbnormal,
        refLow: row.referenceRangeLow,
        refHigh: row.referenceRangeHigh,
      },
    ];
  });

  return (
    <div className="divide-y divide-neutral-100">
      {rows.map((r, i) => {
        const status = deriveStatus({
          isAbnormal: r.isAbnormal,
          referenceRangeLow: r.refLow,
          referenceRangeHigh: r.refHigh,
          valueNumeric: r.value,
        });
        const prev = i > 0 ? rows[i - 1]! : null;
        const change =
          prev && r.value != null && prev.value != null
            ? r.value - prev.value
            : null;
        return (
          <div key={r.date} className="flex items-center justify-between px-3 py-2">
            <span className="text-[11px] font-mono text-neutral-500">{r.date}</span>
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "text-[13px] font-mono font-semibold tabular-nums",
                  r.isAbnormal ? "text-[var(--color-health-warning)]" : "text-neutral-900",
                )}
              >
                {formatObsValue(code, r.value, r.valueText, displayPrecision)}
                {r.unit && <span className="ml-1 text-[10px] font-normal text-neutral-400">{r.unit}</span>}
              </span>
              {change != null && (
                <span
                  className={cn(
                    "text-[11px] font-mono font-semibold",
                    change > 0 ? "text-red-600" : change < 0 ? "text-green-600" : "text-neutral-400",
                  )}
                >
                  {change > 0 ? "↑" : change < 0 ? "↓" : "→"}
                  {change > 0 ? "+" : ""}
                  {Math.abs(change) >= 100 ? change.toFixed(1) : change.toFixed(2)}
                </span>
              )}
              {r.isAbnormal ? (
                <StatusBadge status={status} label={getAbnormalityLabel(status, deriveDirection({ valueNumeric: r.value, referenceRangeLow: r.refLow, referenceRangeHigh: r.refHigh }))} />
              ) : (
                <StatusBadge status="normal" label="正常" />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DashboardScreen({ batches }: { batches: CompareBatch[] }) {
  const utils = trpc.useUtils();
  const modal = useModal();
  const { data: dashData } = trpc.dashboardMetrics.list.useQuery();
  const { data: metricsData } = trpc.metrics.list.useQuery();

  const addMutation = trpc.dashboardMetrics.add.useMutation({
    onSuccess: () => utils.dashboardMetrics.list.invalidate(),
  });
  const removeMutation = trpc.dashboardMetrics.remove.useMutation({
    onSuccess: () => utils.dashboardMetrics.list.invalidate(),
  });

  const [expandedCode, setExpandedCode] = useState<string | null>(null);

  const saved = dashData?.saved ?? [];
  const suggested = dashData?.suggested ?? [];
  const savedCount = dashData?.savedCount ?? 0;

  // 正序时间线（趋势图 / 历次列表用）
  const batchesAsc = useMemo(() => [...batches].reverse(), [batches]);

  const latestByName = useMemo(() => {
    const map = new Map<string, (typeof batches)[number]["metrics"][number]>();
    for (const m of batches[0]?.metrics ?? []) map.set(m.metricCode, m);
    return map;
  }, [batches]);

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

  const openAddModal = () => {
    const candidates = (metricsData ?? [])
      .filter((m) => !saved.some((s) => s.metricCode === m.id))
      .map((m) => ({ id: m.id, name: m.name }));
    modal.show(
      <AddMetricModal
        candidates={candidates}
        onPick={(code) => addMutation.mutate({ metricCode: code })}
      />,
    );
  };

  return (
    <div className="space-y-6">
      {/* 我的关注：列表行式（与首页「需要关注」同构） */}
      <section>
        <div className="card">
          {/* 头部 */}
          <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
            <div className="flex items-center gap-2">
              <Star className="size-3.5 text-accent-500" />
              <h2 className="text-[13px] font-semibold text-neutral-900 font-display">
                我的关注
              </h2>
              {savedCount > 0 && (
                <span className="bg-neutral-100 px-2 py-0.5 text-[10px] font-mono font-bold text-neutral-500 tabular-nums">
                  {savedCount}
                </span>
              )}
            </div>
            <button
              onClick={openAddModal}
              className="flex items-center gap-1 text-[11px] font-mono text-neutral-400 transition-colors hover:text-accent-600"
            >
              <Plus className="size-3" />
              添加指标
            </button>
          </div>

          {/* 首次使用：预填建议 */}
          {savedCount === 0 && suggested.length > 0 && (
            <div className="border-b border-amber-100 bg-amber-50/60 px-4 py-3">
              <p className="flex items-center gap-1.5 text-[12px] font-medium text-amber-900">
                <CircleAlert className="size-3.5 shrink-0" />
                根据最新一次检查（{batches[0]?.date}），建议关注以下 {suggested.length} 项
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
                        "flex items-center gap-0.5 font-mono text-[10px]",
                        s.reason === "异常"
                          ? "text-[var(--color-health-critical)]"
                          : "text-amber-600",
                      )}
                    >
                      {s.reason === "异常" && <ShieldAlert className="size-3" />}
                      {s.reason}
                    </span>
                  </span>
                ))}
              </div>
              <button
                onClick={saveSuggested}
                disabled={addMutation.isPending}
                className="mt-2.5 rounded-lg bg-amber-600 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
              >
                保存为我的关注
              </button>
            </div>
          )}

          {/* 空态 */}
          {savedCount === 0 && suggested.length === 0 && (
            <div className="px-4 py-10 text-center text-[13px] text-neutral-400">
              还没有关注指标，点右上角「添加指标」开始。
            </div>
          )}

          {/* 指标行 */}
          <div className="divide-y divide-neutral-100">
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
                <div key={s.metricCode}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setExpandedCode(isExpanded ? null : s.metricCode)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") setExpandedCode(isExpanded ? null : s.metricCode);
                    }}
                    className="group cursor-pointer px-4 py-3 transition-colors hover:bg-neutral-50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[13px] font-medium text-neutral-900 font-body">
                            {metricName}
                          </span>
                          {row ? (
                            row.isAbnormal ? (
                              <StatusBadge
                                status={healthStatus}
                                label={getAbnormalityLabel(healthStatus, deriveDirection(row))}
                              />
                            ) : (
                              <StatusBadge status="normal" label="正常" />
                            )
                          ) : (
                            <StatusBadge status="neutral" label="无数据" />
                          )}
                        </div>
                        <span className="mt-0.5 block truncate text-[10px] font-mono text-neutral-400">
                          {rangeText}
                          {row?.prevDate && row.prevValue != null && (
                            <>
                              {" · "}上次 {formatObsValue(s.metricCode, row.prevValue, row.prevValueText, row.displayPrecision)}
                              {row.prevUnit ? ` ${row.prevUnit}` : ""}（{row.prevDate}）
                            </>
                          )}
                        </span>
                      </div>
                      {points.length >= 2 && (
                        <MiniSparkline
                          data={points.map((p) => p.value)}
                          color={statusColor[healthStatus] ?? statusColor.normal}
                          width={64}
                          height={20}
                        />
                      )}
                      <div className="min-w-[72px] text-right">
                        <span
                          className={cn(
                            "text-[14px] font-mono font-semibold tabular-nums",
                            row?.isAbnormal ? "text-[var(--color-health-warning)]" : "text-neutral-900",
                          )}
                        >
                          {row ? formatObsValue(s.metricCode, row.value, row.valueText, row.displayPrecision) : "—"}
                        </span>
                        {row?.unit && (
                          <span className="ml-1 text-[10px] font-mono text-neutral-400">
                            {row.unit}
                          </span>
                        )}
                      </div>
                      {/* 辇降幅度：↑红 ↓绿（仅示方向） */}
                      {row?.direction != null && !row.unitIncomparable && row.deltaPercent != null && (
                        <span
                          className={cn(
                            "min-w-[52px] text-right text-[11px] font-mono font-semibold",
                            row.direction === "up"
                              ? "text-red-600"
                              : row.direction === "down"
                                ? "text-green-600"
                                : "text-neutral-400",
                          )}
                        >
                          {row.direction === "up" ? "↑" : row.direction === "down" ? "↓" : "→"}
                          {row.deltaPercent > 0 ? "+" : ""}
                          {Math.abs(row.deltaPercent) >= 1000 ? row.deltaPercent.toFixed(0) : row.deltaPercent.toFixed(1)}%
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeMutation.mutate({ metricCode: s.metricCode });
                        }}
                        disabled={removeMutation.isPending}
                        title="取消关注"
                        className="rounded p-1 text-neutral-300 opacity-0 transition-all hover:bg-neutral-100 hover:text-neutral-500 group-hover:opacity-100"
                      >
                        <X className="size-3.5" />
                      </button>
                      <ChevronDown
                        className={cn(
                          "size-3.5 shrink-0 text-neutral-300 transition-transform",
                          isExpanded && "rotate-180",
                        )}
                      />
                    </div>
                  </div>

                  {/* 行内展开：趋势图（任意次数都画，用户可评估图表形式）+ 历次记录表并列 */}
                  {isExpanded && (
                    <div className="space-y-3 border-t border-neutral-100 bg-neutral-50/60 px-4 py-3">
                      {points.length === 0 ? (
                        <p className="py-3 text-center text-[12px] text-neutral-400">
                          该指标暂无数值记录。
                        </p>
                      ) : (
                        <>
                          <TrendChart
                            data={points.map((p) => ({ date: p.date, value: p.value, unit: row?.unit ?? null }))}
                            referenceRangeLow={row?.referenceRangeLow ?? null}
                            referenceRangeHigh={row?.referenceRangeHigh ?? null}
                            unit={row?.unit ?? null}
                            status={healthStatus}
                            height={240}
                          />
                          <div>
                            <p className="mb-1.5 text-[11px] font-mono text-neutral-400">
                              历次记录
                            </p>
                            <div className="card overflow-hidden">
                              <RecordList
                                code={s.metricCode}
                                unit={row?.unit ?? null}
                                batchesAsc={batchesAsc}
                                displayPrecision={row?.displayPrecision ?? null}
                              />
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* AI 饮食建议 */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-[13px] font-semibold text-neutral-900 font-display">
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
