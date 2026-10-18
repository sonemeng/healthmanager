"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { AnimatedEmptyState } from "@/components/animated-empty-state";
import { cn } from "@/lib/utils";
import {
  Table2,
  LayoutList,
  LayoutGrid,
  Ruler,
} from "lucide-react";
import { DashboardScreen } from "./dashboard-screen";
import { ChangeTopN } from "@/components/health/change-topn";
import { DumbbellCompare } from "@/components/compare/dumbbell-compare";
// spec 20 §3.3：类型与批次视图抽离到共享组件（就诊枢纽卡对比弹窗复用），
// 此处 re-export 保持 `from "./page"` 既有引用兼容（dashboard-screen 等）。
export type { CompareMetricRow, CompareBatch } from "@/components/compare/types";
import { BatchCard, BatchTable } from "@/components/compare/batch-views";

export default function ComparePage() {
  // useSearchParams 需要Suspense 边界（Next App Router 构建要求）
  return (
    <Suspense fallback={null}>
      <ComparePageInner />
    </Suspense>
  );
}

function ComparePageInner() {
  const searchParams = useSearchParams();
  const { data, isLoading } = trpc.observations.compareBatches.useQuery();
  const batches = data?.batches;

  // 四视图（spec 17 §1）：批次对比（默认）| 历年总表 | 位置对比 | 健康大屏
  // 支持 /compare?tab=dashboard|table|dumbbell 深链（健康报告页入口跳转用）
  const tab = searchParams.get("tab");
  const initialView =
    tab === "dashboard"
      ? "dashboard"
      : tab === "table"
        ? "table"
        : tab === "dumbbell"
          ? "dumbbell"
          : "blocks";
  const [view, setView] = useState<
    "blocks" | "table" | "dashboard" | "dumbbell"
  >(initialView);
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
        {/* 三视图切换：历年总表只在多于一次检查时出现（spec 16 既有口径） */}
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
            检查对比
          </button>
          {batches.length > 1 && (
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
              指标总表
            </button>
          )}
          {batches.length > 1 && (
            <button
              onClick={() => setView("dumbbell")}
              className={cn(
                "flex h-[30px] items-center gap-1.5 px-3 font-mono text-[11px] font-medium uppercase tracking-[0.04em] transition-colors",
                view === "dumbbell"
                  ? "bg-white text-accent-600 shadow-xs"
                  : "text-neutral-500 hover:text-neutral-900",
              )}
            >
              <Ruler className="size-3.5" />
              位置对比
            </button>
          )}
          <button
            onClick={() => setView("dashboard")}
            className={cn(
              "flex h-[30px] items-center gap-1.5 px-3 font-mono text-[11px] font-medium uppercase tracking-[0.04em] transition-colors",
              view === "dashboard"
                ? "bg-white text-accent-600 shadow-xs"
                : "text-neutral-500 hover:text-neutral-900",
            )}
          >
            <LayoutGrid className="size-3.5" />
            我的关注
          </button>
        </div>
      </div>

      {view === "blocks" ? (
        <div className="space-y-4">
          {/* 变化幅度 Top-N：最新一次 vs 上一次，按生物指标分类分组，每类 |Δ%| 前 10（spec 18 §3） */}
          {batches.length > 1 && batches[0] && (
            <ChangeTopN
              metrics={batches[0].metrics}
              curDate={batches[0].date}
              prevDate={batches[1]?.date ?? null}
            />
          )}
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
        </div>
      ) : view === "table" ? (
        <BatchTable batches={batches} />
      ) : view === "dumbbell" ? (
        <div className="space-y-4">
          {batches[0] && (
            <DumbbellCompare
              metrics={batches[0].metrics}
              curDate={batches[0].date}
              prevDate={batches[1]?.date ?? null}
            />
          )}
        </div>
      ) : (
        <DashboardScreen batches={batches} />
      )}
    </div>
  );
}
