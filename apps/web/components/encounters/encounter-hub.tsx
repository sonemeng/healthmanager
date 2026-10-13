"use client";

// 就诊枢纽卡（spec 20 §2，v0.1.15 P1）+ 就诊前后疗效对比弹窗（spec 20 §3）。
// 样式纪律：小节头对齐 conditions 页 section 头（icon + 13px semibold + count chip），
// 批次行对齐 home/attention-metrics 列表行；弹窗走 components/modal/Template 范本；
// 对比表复用 compare/batch-views 的 BatchCard（与趋势对比页同一渲染口径）。

import { trpc } from "@/lib/trpc/client";
import { useModal } from "@/components/modal/provider";
import { Template } from "@/components/modal/template";
import { BatchCard } from "@/components/compare/batch-views";
import type { CompareBatch } from "@/components/compare/types";
import { cn } from "@/lib/utils";
import {
  FlaskConical,
  Pill,
  HeartPulse,
  GitCompare,
  CalendarDays,
} from "lucide-react";

// 小节头：icon + 标题 + count chip（conditions 页 section 头同构）
function HubSection({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count: number | null;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="size-3.5 text-neutral-400" />
        <h4 className="text-[12px] font-semibold font-display text-neutral-600">
          {title}
        </h4>
        {count !== null && (
          <span className="bg-neutral-100 px-2 py-0.5 text-[10px] font-mono font-bold text-neutral-500 tabular-nums">
            {count}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

// 就诊前后疗效对比弹窗（spec 20 §3）：after 视角的批次对比行（指标/本次/上次/变化/状态），
// 渲染复用趋势对比页的 BatchCard，口径单一来源。
function CompareModal({
  encounterId,
  encounterDate,
}: {
  encounterId: string;
  encounterDate: string;
}) {
  const modal = useModal();
  const { data, isLoading } = trpc.encounters.comparison.useQuery({
    encounterId,
  });

  return (
    <Template
      title="就诊前后对比"
      description={`对比 ${encounterDate} 就诊前后的最近两次检验结果（不限窗口取最近，已标注距就诊天数）。`}
      // 对比表 min-w 680px，默认 max-w-md(448px) 会横向裁切，放宽到 3xl（768px−48px 内边距=720px ≥ 680px）
      className="md:max-w-3xl"
    >
      {isLoading && (
        <div className="space-y-2">
          <div className="card h-12 animate-pulse bg-neutral-50" />
          <div className="card h-40 animate-pulse bg-neutral-50" />
        </div>
      )}
      {!isLoading && data && (
        <div className="space-y-3">
          {/* 前后批次定位说明 */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono text-neutral-400">
            {data.before ? (
              <span>
                就诊前批次 {data.before.date}（距就诊 {data.before.gapDays} 天）
              </span>
            ) : (
              <span>就诊前无检查记录</span>
            )}
            {data.after && (
              <span>
                就诊后批次 {data.after.date}（距就诊 {data.after.gapDays} 天）
              </span>
            )}
          </div>

          {data.after ? (
            <BatchCard
              batch={
                {
                  date: data.after.date,
                  daysSincePrev: data.before && data.after
                    ? data.after.gapDays + data.before.gapDays
                    : null,
                  metrics: data.metrics,
                } satisfies CompareBatch
              }
              isLatest={false}
              expanded
              onToggle={() => {}}
            />
          ) : (
            <div className="card px-4 py-6 text-center">
              <p className="text-[13px] text-neutral-600 font-body">
                就诊后暂无检验记录，无法对比。
              </p>
              {data.before && (
                <p className="mt-1 text-[11px] font-mono text-neutral-400">
                  就诊前批次：{data.before.date}（{data.before.gapDays} 天前那次就诊）
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={() => modal.hide()}
              className="border border-neutral-200 px-3 py-1.5 text-[12px] font-body text-neutral-700 hover:bg-neutral-50 transition-colors cursor-pointer"
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </Template>
  );
}

export function EncounterHub({
  encounterId,
  encounterDate,
}: {
  encounterId: string;
  encounterDate: string;
}) {
  const modal = useModal();
  const { data, isLoading } = trpc.encounters.hub.useQuery({
    encounterId,
  });

  if (isLoading) {
    return (
      <div className="border-t border-neutral-100 bg-neutral-50/50 px-4 py-4">
        <div className="space-y-2">
          <div className="h-3 w-32 animate-pulse bg-neutral-100" />
          <div className="h-8 w-full animate-pulse bg-neutral-100" />
          <div className="h-3 w-28 animate-pulse bg-neutral-100" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="border-t border-neutral-100 bg-neutral-50/50 px-4 py-4">
      <div className="pl-11 space-y-4">
        {/* ① 检验批次（±7 天） */}
        <HubSection icon={FlaskConical} title="就诊前后 7 天检验" count={data.batches.length}>
          {data.batches.length === 0 ? (
            <p className="text-[12px] text-neutral-400 font-body">
              就诊前后 7 天内无检验记录
            </p>
          ) : (
            <div className="divide-y divide-neutral-100 border border-neutral-200 bg-white">
              {data.batches.map((b) => (
                <div
                  key={b.date}
                  className="flex items-center px-3.5 py-2.5"
                >
                  <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-neutral-900 font-body">
                    <CalendarDays className="size-3.5 text-neutral-400" />
                    {b.date}
                  </span>
                  <span className="ml-3 text-[11px] font-mono text-neutral-400">
                    {b.total} 项
                  </span>
                  <span
                    className={cn(
                      "ml-auto text-[11px] font-mono font-semibold",
                      b.abnormal > 0 ? "text-amber-700" : "text-neutral-400",
                    )}
                  >
                    {b.abnormal > 0 ? `${b.abnormal} 项异常` : "全部正常"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </HubSection>

        {/* ② 当时在用药 */}
        <HubSection icon={Pill} title="当时在用药" count={data.medsAtVisit.length}>
          {data.medsAtVisit.length === 0 ? (
            <p className="text-[12px] text-neutral-400 font-body">
              就诊时点无在用药记录
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {data.medsAtVisit.map((m) => (
                <span
                  key={m.id}
                  className="inline-flex items-center rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[12px] text-neutral-700 font-body"
                  title={
                    m.startDate || m.endDate
                      ? `${m.startDate ?? "…"} ~ ${m.endDate ?? "…"}`
                      : "起止日期未填，按长期在用处理"
                  }
                >
                  {m.name}
                  {m.dosage && (
                    <span className="ml-1 text-[11px] text-neutral-400">{m.dosage}</span>
                  )}
                  {m.frequency && (
                    <span className="ml-1 text-[11px] text-neutral-400">{m.frequency}</span>
                  )}
                  {!m.startDate && !m.endDate && (
                    <span className="ml-1.5 text-[10px] font-mono text-neutral-300">起止未填</span>
                  )}
                </span>
              ))}
            </div>
          )}
        </HubSection>

        {/* ③ 相关病史 */}
        <HubSection icon={HeartPulse} title="相关病史" count={data.conditionsAtVisit.length}>
          {data.conditionsAtVisit.length === 0 ? (
            <p className="text-[12px] text-neutral-400 font-body">
              就诊时点无患病中的病史
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {data.conditionsAtVisit.map((c) => (
                <span
                  key={c.id}
                  className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-body",
                    c.status === "active"
                      ? "bg-amber-50 text-amber-800"
                      : "bg-neutral-100 text-neutral-500",
                  )}
                  title={c.onsetDate ? `起病 ${c.onsetDate}` : "起病日期未填"}
                >
                  {c.name}
                  <span className="ml-1.5 text-[10px] font-mono opacity-70">
                    {c.status === "active" ? "在患" : "就诊时未愈"}
                  </span>
                </span>
              ))}
            </div>
          )}
        </HubSection>

        {/* 动作：前后对比（spec 20 §3） */}
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() =>
              modal.show(
                <CompareModal
                  encounterId={encounterId}
                  encounterDate={encounterDate}
                />,
              )
            }
            className="inline-flex items-center gap-1.5 border border-neutral-200 bg-white px-3 py-1.5 text-[12px] font-body text-neutral-700 hover:bg-neutral-50 transition-colors cursor-pointer"
          >
            <GitCompare className="size-3.5 text-neutral-400" />
            前后对比
          </button>
        </div>
      </div>
    </div>
  );
}
