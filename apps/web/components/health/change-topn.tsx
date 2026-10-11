"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  LabelList,
  ResponsiveContainer,
} from "recharts";
import { TrendingUpDown } from "lucide-react";
import { CATEGORY_META, CATEGORY_ORDER } from "@/lib/biomarker-categories";

export interface ChangeTopNMetric {
  metricCode: string;
  metricName: string;
  category: string;
  unit: string | null;
  deltaPercent: number | null;
  direction: "up" | "down" | "flat" | null;
  unitIncomparable: boolean;
}

interface ChangeTopNProps {
  /** 最新一次检查的各指标行（含 vs 上一次的 deltaPercent / direction） */
  metrics: ChangeTopNMetric[];
  /** 本次检查日期 */
  curDate: string;
  /** 上一次检查日期 */
  prevDate: string | null;
  /** 每类最多展示条数（默认 10） */
  perCategory?: number;
}

// 红=升高、绿=降低（中国股市同色直觉），仅示方向不代表好坏
const COLOR_UP = "#dc2626";
const COLOR_DOWN = "#16a34a";
const COLOR_FLAT = "#a3a3a3";

function colorOf(direction: "up" | "down" | "flat" | null): string {
  return direction === "up"
    ? COLOR_UP
    : direction === "down"
      ? COLOR_DOWN
      : COLOR_FLAT;
}

// 变化幅度格式：+12.3% / -12.3%；绝对值过大收紧小数位（与 compare 页同口径）
function formatDeltaPercent(p: number): string {
  const sign = p > 0 ? "+" : "";
  const abs = Math.abs(p);
  return `${sign}${p.toFixed(abs >= 1000 ? 0 : 1)}%`;
}

export function ChangeTopN({
  metrics,
  curDate,
  prevDate,
  perCategory = 10,
}: ChangeTopNProps) {
  const groups = useMemo(() => {
    const byCat = new Map<string, ChangeTopNMetric[]>();
    for (const m of metrics) {
      if (
        m.direction == null ||
        m.unitIncomparable ||
        m.deltaPercent == null
      ) {
        continue;
      }
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

    const out: { category: string; rows: ChangeTopNMetric[] }[] = [];
    for (const category of ordered) {
      const list = byCat.get(category);
      if (!list || list.length === 0) continue;
      list.sort(
        (a, b) => Math.abs(b.deltaPercent!) - Math.abs(a.deltaPercent!),
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
            变化幅度
          </h2>
          <span className="bg-neutral-100 px-2 py-0.5 text-[10px] font-mono font-bold text-neutral-500 tabular-nums">
            {groups.length} 类
          </span>
        </div>
        <span className="text-[11px] font-mono text-neutral-400">
          {curDate} vs {prevDate ?? "—"} · 每类 |Δ%| 前 {perCategory}
        </span>
      </div>

      {/* 图例（与 /compare 既有口径一致） */}
      <div className="border-b border-neutral-100 px-4 py-2">
        <p className="text-[11px] font-mono text-neutral-400">
          <span className="text-red-600">↑ 升高</span>
          <span className="mx-1 text-neutral-300">/</span>
          <span className="text-green-600">↓ 降低</span>
          <span className="ml-1">（仅示方向，不代表好坏）</span>
        </p>
      </div>

      {/* 分类分组 */}
      <div className="divide-y divide-neutral-100">
        {groups.map(({ category, rows }) => {
          const meta = CATEGORY_META[category];
          const Icon = meta?.icon;
          const label = meta?.label ?? category;
          const data = rows.map((r) => ({
            name: r.metricName,
            mag: Math.abs(r.deltaPercent!),
            label: formatDeltaPercent(r.deltaPercent!),
            dir: r.direction,
          }));
          const height = rows.length * 26 + 6;

          return (
            <div key={category} className="px-4 py-3">
              <div className="mb-2 flex items-center gap-1.5">
                {Icon && <Icon className="size-3.5 text-neutral-400" />}
                <span className="text-[12px] font-medium text-neutral-700 font-body">
                  {label}
                </span>
                <span className="text-[10px] font-mono text-neutral-400 tabular-nums">
                  {rows.length}
                </span>
              </div>

              <div style={{ height }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data}
                    layout="vertical"
                    margin={{ top: 0, right: 60, bottom: 0, left: 0 }}
                    barCategoryGap="22%"
                  >
                    <XAxis type="number" hide domain={[0, "dataMax"]} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={112}
                      tick={{
                        fontSize: 11,
                        fontFamily: "var(--font-body)",
                        fill: "var(--color-neutral-600, #525252)",
                      }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Bar
                      dataKey="mag"
                      barSize={14}
                      radius={[0, 3, 3, 0]}
                      isAnimationActive={false}
                    >
                      {data.map((d, i) => (
                        <Cell key={i} fill={colorOf(d.dir)} />
                      ))}
                      <LabelList
                        dataKey="label"
                        content={(props: unknown) => {
                          const p = props as {
                            x?: number;
                            y?: number;
                            width?: number;
                            height?: number;
                            index?: number;
                          };
                          const i = p.index ?? 0;
                          const d = data[i];
                          if (!d) return null;
                          return (
                            <text
                              x={(p.x ?? 0) + (p.width ?? 0) + 6}
                              y={(p.y ?? 0) + (p.height ?? 0) / 2}
                              dy={4}
                              fontSize={11}
                              fontFamily="var(--font-mono)"
                              fill={colorOf(d.dir)}
                            >
                              {d.label}
                            </text>
                          );
                        }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
