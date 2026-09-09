"use client";

import { use, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { TitleActionHeader } from "@/components/title-action-header";
import {
  StatusBadge,
  type HealthStatus,
} from "@/components/health/status-badge";
import { deriveStatus, formatRange } from "@/lib/health-utils";
import { cn, formatDate, formatObsValue } from "@/lib/utils";
import { DOC_TYPE_LABELS, IMPORT_JOB_STATUS_MAP } from "@/lib/constants";
import {
  Check,
  CheckCheck,
  FileText,
  AlertTriangle,
  Pencil,
  RefreshCw,
} from "lucide-react";

function formatCategoryName(cat: string) {
  const labels: Record<string, string> = {
    lab_result: "检验结果",
    vital_sign: "生命体征",
    medication: "用药",
    condition: "病史",
    encounter: "就诊",
    wearable: "可穿戴设备",
    imaging: "影像",
    dental: "牙科",
    other: "其他",
  };
  return labels[cat] ?? cat;
}

export default function ImportJobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const utils = trpc.useUtils();

  // 状态轮询：处理中每 3 秒刷新，完成后停止
  const { data, isLoading } = trpc.importJobs.getDetail.useQuery(
    { id },
    {
      refetchInterval: (query) => {
        const status = query.state.data?.job.status;
        return status &&
          ["pending", "classifying", "parsing", "normalizing"].includes(status)
          ? 3000
          : false;
      },
    },
  );
  const { data: metricsData } = trpc.metrics.list.useQuery();
  const detailObservations = data?.observations;
  const precisionMap = new Map(
    (metricsData ?? []).map((m) => [m.id, m.displayPrecision] as const),
  );
  // 字典中文映射（id → name）
  const metricNameMap = useMemo(
    () =>
      new Map((metricsData ?? []).map((m) => [m.id, m.name] as const)),
    [metricsData],
  );
  const confirmMutation = trpc.observations.confirm.useMutation({
    onSuccess: () => utils.importJobs.getDetail.invalidate({ id }),
  });
  const correctMutation = trpc.observations.correct.useMutation({
    onSuccess: () => utils.importJobs.getDetail.invalidate({ id }),
  });
  const reprocessMutation = trpc.importJobs.reprocess.useMutation({
    onSuccess: () => utils.importJobs.getDetail.invalidate({ id }),
  });

  const grouped = useMemo(() => {
    if (!detailObservations)
      return new Map<string, NonNullable<typeof detailObservations>>();
    const map = new Map<string, NonNullable<typeof detailObservations>>();
    for (const obs of detailObservations) {
      const cat = obs.category;
      const existing = map.get(cat) ?? [];
      existing.push(obs);
      map.set(cat, existing);
    }
    return map;
  }, [detailObservations]);

  const stats = useMemo(() => {
    if (!detailObservations)
      return { total: 0, abnormal: 0, confirmed: 0, pending: 0 };
    const total = detailObservations.length;
    const abnormal = detailObservations.filter((o) => o.isAbnormal).length;
    const confirmed = detailObservations.filter(
      (o) => o.status === "confirmed" || o.status === "corrected",
    ).length;
    return { total, abnormal, confirmed, pending: total - confirmed };
  }, [detailObservations]);

  if (isLoading) {
    return (
      <div>
        <TitleActionHeader showBackButton title={undefined} />
        <div className="mt-8 grid gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="card h-14 animate-pulse bg-neutral-100"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div>
        <TitleActionHeader
          showBackButton
          title="未找到"
          subtitle="无法找到该次导入。"
        />
      </div>
    );
  }

  const { job, observations } = data;
  const jobStatus =
    IMPORT_JOB_STATUS_MAP[job.status] ?? IMPORT_JOB_STATUS_MAP.completed!;

  const confirmAll = () => {
    observations
      .filter((o) => o.status === "extracted")
      .forEach((o) => confirmMutation.mutate({ id: o.id }));
  };

  return (
    <div className="stagger-children">
      <TitleActionHeader
        showBackButton
        title={
          job.classifiedType
            ? (DOC_TYPE_LABELS[job.classifiedType] ?? job.classifiedType)
            : "导入详情"
        }
        underTitle={
          <div className="mt-2 flex items-center gap-3">
            <StatusBadge status={jobStatus.badge} label={jobStatus.label} />
            {job.classificationConfidence != null && (
              <span className="text-xs text-neutral-400 font-mono">
                置信度 {(job.classificationConfidence * 100).toFixed(0)}%
              </span>
            )}
          </div>
        }
        actions={
          <>
            {stats.pending > 0 && (
              <button
                onClick={confirmAll}
                disabled={confirmMutation.isPending}
                className="flex items-center gap-2 rounded-lg bg-accent-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-accent-700 transition-colors disabled:opacity-50"
              >
                <CheckCheck className="h-4 w-4" />
                全部确认（{stats.pending}）
              </button>
            )}
            <button
              onClick={() => reprocessMutation.mutate({ id })}
              disabled={reprocessMutation.isPending}
              className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-600 shadow-xs hover:border-accent-300 hover:text-accent-600 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn("h-4 w-4", reprocessMutation.isPending && "animate-spin")} />
              {reprocessMutation.isPending ? "重新解析中…" : "重新解析"}
            </button>
          </>
        }
      />

      {/* Summary cards */}
      <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="提取结果" value={stats.total} />
        <SummaryCard
          label="异常"
          value={stats.abnormal}
          variant={stats.abnormal > 0 ? "warning" : "default"}
        />
        <SummaryCard
          label="已确认"
          value={stats.confirmed}
          variant={stats.confirmed > 0 ? "success" : "default"}
        />
        <SummaryCard
          label="待确认"
          value={stats.pending}
          variant={stats.pending > 0 ? "accent" : "default"}
        />
      </div>

      {job.errorMessage && (
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-[var(--color-health-critical-border)] bg-[var(--color-health-critical-bg)] p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-health-critical)]" />
          <p className="text-sm text-[var(--color-health-critical)]">
            {job.errorMessage}
          </p>
        </div>
      )}

      {/* Observations by category */}
      <div className="mt-8 space-y-6">
        {observations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100">
              <FileText className="h-5 w-5 text-neutral-400" />
            </div>
            <p className="mt-3 text-sm font-medium text-neutral-600">
              暂无提取记录
            </p>
            <p className="mt-1 text-xs text-neutral-400">
              本次导入未产生任何观测数据。
            </p>
          </div>
        ) : (
          Array.from(grouped.entries()).map(([category, obs]) => (
            <CategoryGroup
              key={category}
              category={category}
              observations={obs}
              onConfirm={(obsId) => confirmMutation.mutate({ id: obsId })}
              onCorrect={(input) => correctMutation.mutateAsync(input)}
              isConfirming={confirmMutation.isPending}
              precisionMap={precisionMap}
              metricNameMap={metricNameMap}
            />
          ))
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  variant = "default",
}: {
  label: string;
  value: number;
  variant?: "default" | "warning" | "success" | "accent";
}) {
  const valueColor = {
    default: "text-neutral-900",
    warning: "text-[var(--color-health-warning)]",
    success: "text-[var(--color-health-normal)]",
    accent: "text-accent-600",
  }[variant];

  return (
    <div className="card px-4 py-3.5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-neutral-400 font-mono">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-2xl font-medium tracking-[-0.03em] font-display",
          valueColor,
        )}
      >
        {value}
      </div>
    </div>
  );
}

const inputClass =
  "rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[13px] text-neutral-900 placeholder:text-neutral-400 focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100 transition-all";

const gridCols = "grid-cols-[1.6fr_0.8fr_0.8fr_1fr_0.8fr_100px]";

function CategoryGroup({
  category,
  observations,
  onConfirm,
  onCorrect,
  isConfirming,
  precisionMap,
  metricNameMap,
}: {
  category: string;
  observations: {
    id: string;
    metricCode: string;
    valueNumeric: number | null;
    valueText: string | null;
    unit: string | null;
    referenceRangeLow: number | null;
    referenceRangeHigh: number | null;
    isAbnormal: boolean | null;
    status: string;
    confidenceScore: number | null;
    observedAt: Date | string | null;
    originalValueText?: string | null;
    correctionNote?: string | null;
  }[];
  onConfirm: (id: string) => void;
  onCorrect: (input: {
    id: string;
    valueNumeric?: number;
    unit?: string;
    correctionNote?: string;
  }) => Promise<unknown>;
  isConfirming: boolean;
  precisionMap: Map<string, number | null>;
  metricNameMap?: Map<string, string>;
}) {
  const abnormalCount = observations.filter((o) => o.isAbnormal).length;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const [editNote, setEditNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const startEditing = (obs: (typeof observations)[number]) => {
    setEditingId(obs.id);
    setEditValue(obs.valueNumeric != null ? String(obs.valueNumeric) : "");
    setEditUnit(obs.unit ?? "");
    setEditNote("");
  };

  const cancelEditing = () => {
    setEditingId(null);
  };

  const saveCorrection = async () => {
    if (!editingId) return;
    setIsSaving(true);
    try {
      await onCorrect({
        id: editingId,
        ...(editValue !== "" && { valueNumeric: Number(editValue) }),
        ...(editUnit !== "" && { unit: editUnit }),
        ...(editNote !== "" && { correctionNote: editNote }),
      });
      setEditingId(null);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2.5">
        <h3 className="text-sm font-semibold tracking-[-0.01em] text-neutral-700 font-body">
          {formatCategoryName(category)}
        </h3>
        <span className="text-[11px] text-neutral-400 font-mono">
          {observations.length} 条结果
        </span>
        {abnormalCount > 0 && (
          <span className="text-[11px] font-medium text-[var(--color-health-warning)] font-mono">
            {abnormalCount} 项异常
          </span>
        )}
      </div>

      <div className="card">
        {/* Table header */}
        <div
          className={cn(
            "grid gap-x-4 border-b border-neutral-200 bg-neutral-50 px-5 py-2",
            gridCols,
          )}
        >
          {["指标", "日期", "结果", "参考范围", "状态", ""].map((h) => (
            <div
              key={h}
              className="text-[10px] font-semibold uppercase tracking-[0.06em] text-neutral-400 font-mono"
            >
              {h}
            </div>
          ))}
        </div>

        {/* Rows */}
        {observations.map((obs) => {
          const healthStatus = deriveStatus(obs);
          const isConfirmed =
            obs.status === "confirmed" || obs.status === "corrected";
          const isPending = obs.status === "extracted";
          const isFlagged = obs.status === "flagged";
          const isEditing = editingId === obs.id;

          // 显示优先级：识别原文 > 未识别项目 > 字典中文名
          const displayName = obs.originalValueText?.trim()
            ? obs.originalValueText
            : obs.metricCode === "unmatched"
              ? "未识别项目"
              : (metricNameMap?.get(obs.metricCode) ?? obs.metricCode);

          return (
            <div key={obs.id}>
              <div
                className={cn(
                  "grid items-center gap-x-4 border-b border-neutral-100 px-5 py-3 transition-colors last:border-b-0",
                  gridCols,
                  obs.isAbnormal && "bg-[var(--color-health-warning-bg)]/40",
                )}
              >
                {/* Metric name */}
                <div className="text-sm font-medium text-neutral-900 font-body flex items-center gap-2 min-w-0">
                  <span className="truncate" title={displayName}>
                    {displayName}
                  </span>
                  {isFlagged && (
                    <span
                      className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700"
                      title={obs.correctionNote ?? undefined}
                    >
                      未匹配
                    </span>
                  )}
                </div>

                {/* Date */}
                <div className="text-xs text-neutral-500 font-mono">
                  {formatDate(obs.observedAt)}
                </div>

                {/* Value + unit */}
                <div className="flex items-baseline gap-1.5">
                  <span
                    className={cn(
                      "text-[15px] font-semibold tracking-[-0.01em] font-mono tabular-nums",
                      obs.isAbnormal
                        ? healthStatus === "critical"
                          ? "text-[var(--color-health-critical)]"
                          : "text-[var(--color-health-warning)]"
                        : "text-neutral-900",
                    )}
                  >
                    {formatObsValue(obs.metricCode, obs.valueNumeric, obs.valueText, precisionMap.get(obs.metricCode))}
                  </span>
                  {obs.unit && (
                    <span className="text-[11px] text-neutral-400 font-mono">
                      {obs.unit}
                    </span>
                  )}
                </div>

                {/* Reference range */}
                <div className="text-xs text-neutral-400 font-mono">
                  {formatRange(
                    obs.referenceRangeLow,
                    obs.referenceRangeHigh,
                    obs.unit,
                  )}
                </div>

                {/* Status badge */}
                <div>
                  {obs.isAbnormal ? (
                    <StatusBadge
                      status={healthStatus}
                      label={healthStatus === "critical" ? "偏高" : "异常"}
                    />
                  ) : (
                    <StatusBadge status="normal" label="正常" />
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-1.5">
                  {isConfirmed ? (
                    <>
                      <span className="flex items-center gap-1 text-[11px] text-[var(--color-health-normal)] font-mono">
                        <Check className="h-3 w-3" />
                        {obs.status === "corrected" ? "已修正" : "已确认"}
                      </span>
                      <button
                        onClick={() => startEditing(obs)}
                        className="ml-1 rounded-md p-1 text-neutral-300 opacity-0 transition-all hover:bg-neutral-100 hover:text-neutral-500 group-hover:opacity-100 [div:hover>&]:opacity-100"
                        title="编辑"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    </>
                  ) : isPending ? (
                    <>
                      <button
                        onClick={() => onConfirm(obs.id)}
                        disabled={isConfirming}
                        className="flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-600 shadow-xs transition-all hover:border-accent-300 hover:text-accent-600 hover:shadow-sm disabled:opacity-50 font-mono"
                      >
                        <Check className="h-3 w-3" />
                        确认
                      </button>
                      <button
                        onClick={() => startEditing(obs)}
                        className="rounded-md border border-neutral-200 bg-white p-1 text-neutral-400 shadow-xs transition-all hover:border-accent-300 hover:text-accent-600 hover:shadow-sm"
                        title="编辑"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    </>
                  ) : isFlagged ? (
                    // 待手动匹配：仅文字提示，不提供确认/删除
                    <span
                      className="text-[11px] text-amber-600 font-mono"
                      title={obs.correctionNote ?? undefined}
                    >
                      待手动匹配
                    </span>
                  ) : null}
                </div>
              </div>

              {/* Inline edit form */}
              {isEditing && (
                <div className="border-b border-neutral-100 bg-neutral-50/60 px-5 py-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-neutral-400 font-mono">
                        数值
                      </span>
                      <input
                        type="number"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className={cn(inputClass, "w-28")}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-neutral-400 font-mono">
                        单位
                      </span>
                      <input
                        type="text"
                        value={editUnit}
                        onChange={(e) => setEditUnit(e.target.value)}
                        className={cn(inputClass, "w-24")}
                      />
                    </label>
                    <label className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-neutral-400 font-mono">
                        备注
                      </span>
                      <input
                        type="text"
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                        placeholder="修改原因"
                        className={inputClass}
                      />
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={cancelEditing}
                        className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[13px] font-medium text-neutral-600 transition-colors hover:bg-neutral-50"
                      >
                        取消
                      </button>
                      <button
                        onClick={saveCorrection}
                        disabled={isSaving}
                        className="rounded-lg bg-accent-600 px-4 py-2 text-[13px] font-medium text-white shadow-sm transition-colors hover:bg-accent-700 disabled:opacity-50"
                      >
                        保存
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
