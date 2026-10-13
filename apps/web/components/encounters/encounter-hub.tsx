"use client";

// 就诊枢纽卡（spec 20 §2，v0.1.15 P1）+ 就诊前后疗效对比弹窗（spec 20 §3）
// + AI 就诊摘要（spec 20 §4，v0.1.16 P3）+ 医嘱复查提醒节（spec 20 §5，v0.1.16 P4）。
// 样式纪律：小节头对齐 conditions 页 section 头（icon + 13px semibold + count chip），
// 批次行对齐 home/attention-metrics 列表行；弹窗走 components/modal/Template 范本；
// 对比表复用 compare/batch-views 的 BatchCard（与趋势对比页同一渲染口径）；
// 摘要 Markdown 渲染对齐 reports 页 ReactMarkdown 定制；表单样式对齐 AddEncounterModal。

import { useState } from "react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { trpc } from "@/lib/trpc/client";
import { useModal } from "@/components/modal/provider";
import { Template } from "@/components/modal/template";
import { BatchCard } from "@/components/compare/batch-views";
import type { CompareBatch } from "@/components/compare/types";
import { cn } from "@/lib/utils";
import { downloadText } from "@/lib/export";
import {
  FlaskConical,
  Pill,
  HeartPulse,
  GitCompare,
  CalendarDays,
  BellRing,
  Sparkles,
  FileDown,
  Loader2,
  Check,
  X,
} from "lucide-react";

// 表单样式范本（AddEncounterModal 同款，禁自创）
const inputClass =
  "w-full border border-neutral-200 bg-white px-3 py-2.5 text-[14px] text-neutral-900 placeholder:text-neutral-400 focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100 transition-all";
const labelClass =
  "block text-[13px] font-medium text-neutral-700 mb-1.5 font-display";

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

// AI 就诊摘要弹窗（spec 20 §4，v0.1.16 P3）：
// 手动生成（不自动预生成）；Markdown 渲染对齐 reports 页；生成失败明确报错不静默。
function SummaryModal({
  encounterId,
  encounterDate,
}: {
  encounterId: string;
  encounterDate: string;
}) {
  const modal = useModal();
  const { data: summary, isLoading } = trpc.ai.latestEncounterSummary.useQuery({
    encounterId,
  });
  // 本地保存本次生成内容（重复生成 = 新 insight 保留历史，弹窗内即时刷新）
  const [generated, setGenerated] = useState<string | null>(null);
  const generate = trpc.ai.encounterSummary.useMutation({
    onSuccess: (result) => setGenerated(result.content),
    onError: (error) =>
      toast.error(error.message || "摘要生成失败，请稍后重试"),
  });

  const content = generated ?? summary?.content ?? null;

  return (
    <Template
      title="AI 就诊摘要"
      description={`基于 ${encounterDate} 就诊记录与前后检验数据生成的摘要，可直接分享给接诊医生。`}
      className="md:max-w-2xl"
    >
      {isLoading ? (
        <div className="space-y-2">
          <div className="card h-12 animate-pulse bg-neutral-50" />
          <div className="card h-40 animate-pulse bg-neutral-50" />
        </div>
      ) : content ? (
        <div className="space-y-3">
          <div className="max-h-[60vh] overflow-y-auto text-[13px] leading-relaxed text-neutral-700 font-body">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h2: ({ children }) => (
                  <h2 className="mb-2 mt-5 text-base font-semibold text-neutral-900 first:mt-0">
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="mb-1 mt-4 text-sm font-semibold text-neutral-900">
                    {children}
                  </h3>
                ),
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                ul: ({ children }) => (
                  <ul className="mb-3 list-disc space-y-1 pl-5">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="mb-3 list-decimal space-y-1 pl-5">{children}</ol>
                ),
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
          <div className="flex items-center justify-between border-t border-neutral-100 pt-3">
            <button
              onClick={() =>
                downloadText(
                  `healthmanager-就诊摘要-${encounterDate}`,
                  content,
                  "text/markdown;charset=utf-8",
                  "md",
                )
              }
              className="inline-flex items-center gap-1.5 border border-neutral-200 bg-white px-3 py-1.5 text-[12px] font-body text-neutral-700 hover:bg-neutral-50 transition-colors cursor-pointer"
            >
              <FileDown className="size-3.5 text-neutral-400" />
              导出
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => generate.mutate({ encounterId })}
                disabled={generate.isPending}
                className="inline-flex items-center gap-1.5 border border-neutral-200 bg-white px-3 py-1.5 text-[12px] font-body text-neutral-700 hover:bg-neutral-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generate.isPending ? (
                  <Loader2 className="size-3.5 text-neutral-400 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5 text-neutral-400" />
                )}
                重新生成
              </button>
              <button
                onClick={() => modal.hide()}
                className="border border-neutral-200 px-3 py-1.5 text-[12px] font-body text-neutral-700 hover:bg-neutral-50 transition-colors cursor-pointer"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="card px-4 py-6 text-center">
            <p className="text-[13px] text-neutral-600 font-body">
              尚未生成摘要。摘要基于本次就诊的病历四节、前后 7 天检验批次、
              时点用药与病史生成，交给接诊医生快速掌握情况。
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => generate.mutate({ encounterId })}
              disabled={generate.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-accent-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generate.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              {generate.isPending ? "生成中…" : "生成摘要"}
            </button>
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

// 提醒状态中文标签
const reminderStatusLabels: Record<string, string> = {
  pending: "待复查",
  done: "已完成",
  dismissed: "不再提醒",
};

// ④ 医嘱复查提醒节（spec 20 §5，v0.1.16 P4）：
// 解析自动行（intervalDays 非空）与手动补录行统一展示；pending 可操作。
function RemindersSection({ encounterId }: { encounterId: string }) {
  const utils = trpc.useUtils();
  const { data: reminders } = trpc.encounters.reminders.useQuery({
    encounterId,
  });
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");

  const invalidate = () => {
    utils.encounters.reminders.invalidate();
    utils.encounters.upcomingReminders.invalidate();
  };
  const setStatus = trpc.encounters.setReminderStatus.useMutation({
    onSettled: invalidate,
    onError: (error) => toast.error(error.message || "操作失败"),
  });
  const createManual = trpc.encounters.createManualReminder.useMutation({
    onSuccess: () => {
      setDueDate("");
      setNote("");
      invalidate();
    },
    onError: (error) => toast.error(error.message || "添加失败"),
  });

  const todayKey = new Date().toISOString().slice(0, 10);
  const items = reminders ?? [];

  return (
    <HubSection
      icon={BellRing}
      title="复查提醒"
      count={items.length}
    >
      {items.length === 0 ? (
        <p className="text-[12px] text-neutral-400 font-body">
          暂无复查提醒（医嘱中含「X 个月后复查」等明确期限时自动生成）
        </p>
      ) : (
        <div className="divide-y divide-neutral-100 border border-neutral-200 bg-white">
          {items.map((r) => {
            const overdue = r.status === "pending" && r.dueDate < todayKey;
            return (
              <div
                key={r.id}
                className="flex items-center gap-2 px-3.5 py-2.5"
              >
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 text-[12px] font-medium font-body",
                    overdue ? "text-amber-700" : "text-neutral-900",
                  )}
                >
                  <CalendarDays className="size-3.5 text-neutral-400" />
                  {r.dueDate}
                </span>
                <span
                  className="min-w-0 flex-1 truncate text-[11px] font-body text-neutral-400"
                  title={
                    r.sourceText
                      ? r.intervalDays == null
                        ? `手动补录：${r.sourceText}`
                        : `医嘱原文：${r.sourceText}`
                      : "手动补录"
                  }
                >
                  {r.sourceText
                    ? r.intervalDays == null
                      ? `手动补录：${r.sourceText}`
                      : `医嘱：${r.sourceText}`
                    : "手动补录"}
                </span>
                {r.status === "pending" ? (
                  <span className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() =>
                        setStatus.mutate({ id: r.id, status: "done" })
                      }
                      title="标记为已完成"
                      className="inline-flex items-center gap-1 border border-neutral-200 bg-white px-2 py-1 text-[11px] font-body text-neutral-600 hover:bg-neutral-50 transition-colors cursor-pointer"
                    >
                      <Check className="size-3" />
                      已完成
                    </button>
                    <button
                      onClick={() =>
                        setStatus.mutate({ id: r.id, status: "dismissed" })
                      }
                      title="不再提醒"
                      className="inline-flex items-center gap-1 border border-neutral-200 bg-white px-2 py-1 text-[11px] font-body text-neutral-600 hover:bg-neutral-50 transition-colors cursor-pointer"
                    >
                      <X className="size-3" />
                      不再提醒
                    </button>
                  </span>
                ) : (
                  <span
                    className={cn(
                      "shrink-0 text-[10px] font-mono font-bold",
                      r.status === "done"
                        ? "text-neutral-400"
                        : "text-neutral-300",
                    )}
                  >
                    {reminderStatusLabels[r.status] ?? r.status}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 手动补录小表单（无明确期限的医嘱走这里，2026-10-13 拍板） */}
      <div className="mt-2.5 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
        <div className="min-w-0">
          <label className={labelClass}>补录复查日期</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="min-w-0">
          <label className={labelClass}>备注（可选）</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="如：眼底检查"
            className={inputClass}
          />
        </div>
        <button
          onClick={() =>
            dueDate &&
            createManual.mutate({
              encounterId,
              dueDate,
              note: note.trim() || undefined,
            })
          }
          disabled={!dueDate || createManual.isPending}
          className="h-[42px] shrink-0 rounded-lg bg-accent-600 px-4 text-[13px] font-medium text-white hover:bg-accent-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {createManual.isPending ? "添加中…" : "添加"}
        </button>
      </div>
    </HubSection>
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

        {/* ④ 复查提醒（spec 20 §5，v0.1.16 P4） */}
        <RemindersSection encounterId={encounterId} />

        {/* 动作：前后对比（spec 20 §3）+ AI 摘要（spec 20 §4） */}
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
          <button
            onClick={() =>
              modal.show(
                <SummaryModal
                  encounterId={encounterId}
                  encounterDate={encounterDate}
                />,
              )
            }
            className="inline-flex items-center gap-1.5 border border-neutral-200 bg-white px-3 py-1.5 text-[12px] font-body text-neutral-700 hover:bg-neutral-50 transition-colors cursor-pointer"
          >
            <Sparkles className="size-3.5 text-neutral-400" />
            AI 摘要
          </button>
        </div>
      </div>
    </div>
  );
}
