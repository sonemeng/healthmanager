"use client";

import { useMemo } from "react";
import { TrendingUpDown } from "lucide-react";
import { CATEGORY_META, CATEGORY_ORDER } from "@/lib/biomarker-categories";
import { cn, formatObsValue } from "@/lib/utils";
import {
  formatDeltaNumber,
  formatDeltaPercent,
} from "@/components/compare/batch-views";
import type { CompareMetricRow } from "@/components/compare/types";

interface ChangeTopNProps {
  /** 最新一次检查的各指标行（含 vs 上一次的 prevValue/value/deltaPercent/异常状态） */
  metrics: CompareMetricRow[];
  /** 本次检查日期 */
  curDate: string;
  /** 上一次检查日期 */
  prevDate: string | null;
  /** 每类最多展示条数（默认 5） */
  perCategory?: number;
}

/**
 * 「变化幅度」面板（spec 18 §3 起源，2026-10-18 重做为排行榜）。
 *
 * 旧版是 recharts 横向条形图，用户验收提出四点，全部成立：
 * 1) Y 轴名宽写死 112px，长指标名被截断；
 * 2) 大面积纯红/纯绿条与全站「中性底 + accent + 琥珀(异常)」的纪律不符——
 *    红绿在全站只以 12px 小字/箭头出现（涨跌方向约定），不该铺成色块；
 * 3) 悬浮无信息（上次/本次/区间都没传进来）；
 * 4) 条长编码 |Δ%| 无法区分「临床大变化」与「小基数百分比游戏」
 *    （实测：结晶 0.5→0 的 -100% 与尿微量白蛋白 140.9→1.27 的 -99.1% 条长相同）。
 *
 * 现为紧凑排行列表：指标名自动换行不截断；上次值→本次值、涨跌（沿用页面的
 * ↑红/↓绿小字约定）、参考区间与本次状态直接可见，无需悬浮；
 * 排序「状态翻转优先」——正常→异常（变异常）最前、异常→正常（回正常）次之、
 * 其余按 |Δ%| 降序，小基数的 -100% 不再霸榜。
 */

/** 状态翻转档位：0=变异常（最优先）1=回正常 2=纯幅度变化 */
function flipRank(m: CompareMetricRow): number {
  if (m.prevIsAbnormal === false && m.isAbnormal === true) return 0;
  if (m.prevIsAbnormal === true && m.isAbnormal === false) return 1;
  return 2;
}

function fmtRangeNum(n: number): string {
  return String(n);
}

/** 参考区间文字：双侧 lo~hi；单侧 ≥lo / ≤hi；无区间返回 null */
function rangeText(m: CompareMetricRow): string | null {
  const lo = m.referenceRangeLow;
  const hi = m.referenceRangeHigh;
  if (lo != null && hi != null) return `参考 ${fmtRangeNum(lo)}~${fmtRangeNum(hi)}`;
  if (hi != null) return `参考 ≤${fmtRangeNum(hi)}`;
  if (lo != null) return `参考 ≥${fmtRangeNum(lo)}`;
  return null;
}

/** 本次相对区间的状态说明（与化验单 ↑/↓ 语义一致） */
function statusText(m: CompareMetricRow): string | null {
  if (m.isAbnormal !== true || m.value == null) return null;
  const lo = m.referenceRangeLow;
  const hi = m.referenceRangeHigh;
  if (hi != null && m.value > hi) return "本次偏高";
  if (lo != null && m.value < lo) return "本次偏低";
  return "偏离区间";
}

export function ChangeTopN({
  metrics,
  curDate,
  prevDate,
  perCategory = 5,
}: ChangeTopNProps) {
  const groups = useMemo(() => {
    const byCat = new Map<string, CompareMetricRow[]>();
    for (const m of metrics) {
      // 单位不可比 / 无方向（缺上期数值）的不参与排行；翻转项即使 Δ% 为空
      // （上期为 0）也保留——用差值展示（如 0 → 0.5）
      if (m.direction == null || m.unitIncomparable) continue;
      const list = byCat.get(m.category) ?? [];
      list.push(m);
      byCat.set(m.category, list);
    }

    // 已知分类按 CATEGORY_ORDER 排；字典里出现但未收录的分类排到末尾（保持稳定）
    const known = new Set<string>(CATEGORY_ORDER);
    const ordered = [
      ...CATEGORY_ORDER,
      ...Array.from(byCat.keys()).filter((c) => !known.has(c)),
    ];

    const out: { category: string; rows: CompareMetricRow[] }[] = [];
    for (const category of ordered) {
      const list = byCat.get(category);
      if (!list || list.length === 0) continue;
      list.sort(
        (a, b) =>
          flipRank(a) - flipRank(b) ||
          Math.abs(b.deltaPercent ?? Math.abs(b.delta ?? 0)) -
            Math.abs(a.deltaPercent ?? Math.abs(a.delta ?? 0)),
      );
      out.push({ category, rows: list.slice(0, perCategory) });
    }
    return out;
  }, [metrics, perCategory]);

  if (groups.length === 0) return null;

  return (
    <section className="card">
      {/* 头部 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <TrendingUpDown className="size-3.5 text-accent-500" />
          <h2 className="text-[13px] font-semibold text-neutral-900 font-display">
            变化最明显
          </h2>
          <span className="bg-neutral-100 px-2 py-0.5 text-[10px] font-mono font-bold text-neutral-500 tabular-nums">
            {groups.length} 类
          </span>
        </div>
        <span className="text-[11px] font-mono text-neutral-400">
          {curDate} vs {prevDate ?? "—"} · 状态翻转优先 · 每类前 {perCategory}
        </span>
      </div>

      {/* 图例（与 /compare 既有口径一致） */}
      <div className="border-b border-neutral-100 px-4 py-2">
        <p className="text-[11px] font-mono text-neutral-400">
          <span className="text-red-600">↑ 升高</span>
          <span className="mx-1 text-neutral-300">/</span>
          <span className="text-green-600">↓ 降低</span>
          <span className="ml-2">
            仅示方向；「变异常 / 回正常」标出两次检查间参考区间状态的变化
          </span>
        </p>
      </div>

      {/* 分类分组 */}
      <div className="divide-y divide-neutral-100">
        {groups.map(({ category, rows }) => {
          const meta = CATEGORY_META[category];
          const Icon = meta?.icon;
          const label = meta?.label ?? category;

          return (
            <div key={category} className="px-4 py-3">
              <div className="mb-1 flex items-center gap-1.5">
                {Icon && <Icon className="size-3.5 text-neutral-400" />}
                <span className="text-[12px] font-medium text-neutral-700 font-body">
                  {label}
                </span>
                <span className="text-[10px] font-mono text-neutral-400 tabular-nums">
                  {rows.length}
                </span>
              </div>

              <ul>
                {rows.map((m) => {
                  const rank = flipRank(m);
                  const worsening = rank === 0;
                  const improving = rank === 1;
                  const range = rangeText(m);
                  const status = statusText(m);

                  const prevDisplay = formatObsValue(
                    m.metricCode,
                    m.prevValue,
                    m.prevValueText,
                    m.displayPrecision,
                  );
                  const curDisplay = formatObsValue(
                    m.metricCode,
                    m.value,
                    m.valueText,
                    m.displayPrecision,
                  );

                  const deltaText =
                    m.direction === "flat"
                      ? "→ 0%"
                      : m.deltaPercent != null
                        ? formatDeltaPercent(m.deltaPercent)
                        : m.delta != null
                          ? formatDeltaNumber(m.delta)
                          : "—";
                  const deltaCls =
                    m.direction === "up"
                      ? "text-red-600"
                      : m.direction === "down"
                        ? "text-green-600"
                        : "text-neutral-400";

                  return (
                    <li
                      key={m.metricCode}
                      className="border-b border-neutral-100 py-2 last:border-b-0 transition-colors hover:bg-neutral-50"
                    >
                      <div className="flex items-baseline gap-3">
                        {/* 指标名：流式换行，长名不截断 */}
                        <span className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-neutral-900 font-body break-words">
                          {m.metricName}
                        </span>

                        {/* 状态翻转标记 */}
                        {worsening && (
                          <span
                            className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                            style={{
                              color: "var(--color-health-warning)",
                              background: "var(--color-health-warning-bg)",
                            }}
                          >
                            变异常
                          </span>
                        )}
                        {improving && (
                          <span className="shrink-0 rounded-full bg-accent-50 px-1.5 py-0.5 text-[10px] font-medium text-accent-700">
                            回正常
                          </span>
                        )}

                        {/* 上次 → 本次 */}
                        <span className="shrink-0 whitespace-nowrap font-mono text-[12px] tabular-nums">
                          <span className="text-neutral-400">{prevDisplay}</span>
                          <span className="mx-1 text-neutral-300">→</span>
                          <span
                            className={cn(
                              "font-semibold",
                              m.isAbnormal
                                ? "text-[var(--color-health-warning)]"
                                : "text-neutral-900",
                            )}
                          >
                            {curDisplay}
                          </span>
                          {m.unit && (
                            <span className="ml-1 text-[10px] text-neutral-400">
                              {m.unit}
                            </span>
                          )}
                        </span>

                        {/* 涨跌（沿用页面 ↑红/↓绿 小字约定） */}
                        <span
                          className={cn(
                            "w-[64px] shrink-0 text-right font-mono text-[12px] font-semibold tabular-nums",
                            deltaCls,
                          )}
                        >
                          {deltaText}
                        </span>
                      </div>

                      {/* 参考区间 + 本次状态 */}
                      {(range != null || status != null) && (
                        <p className="mt-0.5 font-mono text-[10px] text-neutral-400">
                          {range}
                          {range != null && status != null && " · "}
                          {status && (
                            <span
                              className="font-medium"
                              style={{ color: "var(--color-health-warning)" }}
                            >
                              {status}
                            </span>
                          )}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
