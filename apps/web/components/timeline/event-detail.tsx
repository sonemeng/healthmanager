"use client";

import Link from "next/link";
import { Sparkles, ExternalLink } from "lucide-react";
import { StatusBadge } from "@/components/health/status-badge";
import { TrendChart } from "@/components/health/trend-chart";
import { useModal } from "@/components/modal/provider";
import { Template } from "@/components/modal/template";
import { fmtDay, type EventDetail, type MetricSeries } from "./derive";

// ---------------------------------------------------------------------------
// 时间线 C（spec 18 §1）：事件详情卡（点/线段点开）
// + 分面小图放大卡（§2：点开看大图）
// ---------------------------------------------------------------------------

export function EventDetailCard({ detail }: { detail: EventDetail }) {
  const modal = useModal();
  return (
    <Template
      title={detail.title}
      description={detail.dateLabel}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <span className="font-mono text-[10px] text-neutral-400">
            {detail.dateLabel}
          </span>
          <button
            type="button"
            onClick={() => modal.hide()}
            className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px] text-neutral-600 transition-colors hover:bg-neutral-50"
          >
            关闭
          </button>
        </div>
      }
    >
      {detail.badge && (
        <div>
          <StatusBadge status={detail.badge.status} label={detail.badge.label} />
        </div>
      )}

      {detail.rows.length > 0 && (
        <dl className="divide-y divide-neutral-100 border border-neutral-100">
          {detail.rows.map((r) => (
            <div key={r.label} className="flex gap-3 px-3 py-2">
              <dt className="w-20 shrink-0 font-mono text-[11px] text-neutral-400">
                {r.label}
              </dt>
              <dd className="min-w-0 flex-1 text-[13px] leading-relaxed text-neutral-800">
                {r.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {detail.note && (
        <p className="border border-neutral-100 bg-neutral-50/60 px-3 py-2 text-[12px] leading-relaxed text-neutral-600">
          {detail.note}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {detail.href && (
          <Link
            href={detail.href}
            className="inline-flex items-center gap-1 text-[12px] font-medium text-accent-600 hover:text-accent-700"
          >
            <ExternalLink className="size-3.5" />
            {detail.hrefLabel ?? "查看详情"}
          </Link>
        )}
        {detail.aiQuestion && (
          <Link
            href={`/ai?question=${encodeURIComponent(detail.aiQuestion)}`}
            className="inline-flex items-center gap-1 text-[12px] font-medium text-accent-600 hover:text-accent-700"
          >
            <Sparkles className="size-3.5" />
            基于此记录问 AI
          </Link>
        )}
      </div>
    </Template>
  );
}

export function MetricTrendCard({ series }: { series: MetricSeries }) {
  const modal = useModal();
  const data = series.points.map((p) => ({
    date: new Date(p.t).toISOString(),
    value: p.v,
    unit: series.unit,
  }));

  return (
    <Template
      title={series.name}
      description={
        series.unit ? `单位 ${series.unit}` : "完整趋势（纵轴独立）"
      }
      footer={
        <div className="flex w-full justify-end">
          <button
            type="button"
            onClick={() => modal.hide()}
            className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px] text-neutral-600 transition-colors hover:bg-neutral-50"
          >
            关闭
          </button>
        </div>
      }
    >
      <TrendChart
        data={data}
        referenceRangeLow={series.refLow}
        referenceRangeHigh={series.refHigh}
        unit={series.unit}
        status={series.status}
        height={240}
      />
      <div className="divide-y divide-neutral-100 border border-neutral-100">
        {[...series.points].reverse().map((p) => (
          <div
            key={p.t}
            className="flex items-center justify-between px-3 py-2"
          >
            <span className="font-mono text-[11px] text-neutral-500">
              {fmtDay(p.t)}
            </span>
            <span
              className="font-mono text-[13px] font-semibold tabular-nums"
              style={{
                color: p.abnormal
                  ? "var(--color-health-warning)"
                  : "var(--color-neutral-900)",
              }}
            >
              {p.v}
              {series.unit && (
                <span className="ml-1 text-[10px] font-normal text-neutral-400">
                  {series.unit}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </Template>
  );
}
