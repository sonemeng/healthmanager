'use client';

import Link from 'next/link';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Sparkles,
  ArrowDownRight,
  ArrowUpRight,
  Minus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { HealthStatus } from '@/components/health/status-badge';

export interface HealthInsight {
  id: string;
  type: 'improvement' | 'decline' | 'alert' | 'milestone';
  title: string;
  description: string;
  metricCode?: string;
  status: HealthStatus;
}

interface HealthInsightsProps {
  insights: HealthInsight[];
}

const insightConfig = {
  improvement: {
    icon: ArrowDownRight,
    color: 'text-health-normal',
    bg: 'bg-green-50',
    border: 'border-green-100',
  },
  decline: {
    icon: ArrowUpRight,
    color: 'text-health-warning',
    bg: 'bg-amber-50',
    border: 'border-amber-100',
  },
  alert: {
    icon: AlertTriangle,
    color: 'text-health-critical',
    bg: 'bg-red-50',
    border: 'border-red-100',
  },
  milestone: {
    icon: CheckCircle2,
    color: 'text-accent-600',
    bg: 'bg-accent-50',
    border: 'border-accent-100',
  },
};

export function HealthInsights({ insights }: HealthInsightsProps) {
  if (insights.length === 0) return null;

  return (
    <div className="card">
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
        <div className="flex items-center gap-2">
          <Sparkles className="size-3.5 text-accent-500" />
          <h2 className="text-[13px] font-semibold text-neutral-900 font-display">
            健康洞察
          </h2>
        </div>
      </div>
      <div className="divide-y divide-neutral-100">
        {insights.slice(0, 5).map((insight) => {
          const config = insightConfig[insight.type];
          const Icon = config.icon;

          const content = (
            <div className="flex items-start gap-3 px-4 py-3 hover:bg-neutral-50 transition-colors group">
              <div className={cn('flex items-center justify-center size-6 mt-0.5 shrink-0', config.bg, config.border, 'border')}>
                <Icon className={cn('size-3', config.color)} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-neutral-800 font-body">
                  {insight.title}
                </p>
                <p className="text-[11px] text-neutral-500 font-body mt-0.5">
                  {insight.description}
                </p>
              </div>
              {insight.metricCode && (
                <ChevronRight className="size-3.5 text-neutral-300 group-hover:text-neutral-500 transition-colors mt-1 shrink-0" />
              )}
            </div>
          );

          return insight.metricCode ? (
            <Link key={insight.id} href={`/labs/${insight.metricCode}`}>
              {content}
            </Link>
          ) : (
            <div key={insight.id}>
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Generate rule-based health insights from observation data
 */
export function generateInsights(
  byMetric: Map<string, Array<{
    metricCode: string;
    category?: string | null;
    valueNumeric?: number | null;
    referenceRangeLow?: number | null;
    referenceRangeHigh?: number | null;
    isAbnormal?: boolean | null;
    observedAt: string | Date;
  }>>,
  metricNameMap: Map<string, string>,
): HealthInsight[] {
  const insights: HealthInsight[] = [];
  const now = Date.now();

  for (const [code, obs] of byMetric) {
    if (obs.length < 2) continue;

    const sorted = [...obs].sort(
      (a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime(),
    );

    const latest = sorted[sorted.length - 1]!;
    const previous = sorted[sorted.length - 2]!;
    const metricName = metricNameMap.get(code) ?? code.replace(/_/g, ' ');

    if (latest.valueNumeric == null || previous.valueNumeric == null) continue;

    const changePct = Math.abs(previous.valueNumeric) > 0
      ? ((latest.valueNumeric - previous.valueNumeric) / Math.abs(previous.valueNumeric)) * 100
      : 0;
    const refLow = latest.referenceRangeLow;
    const refHigh = latest.referenceRangeHigh;

    // Insight: Metric normalized (was abnormal, now normal)
    if (previous.isAbnormal && !latest.isAbnormal) {
      insights.push({
        id: `normalized-${code}`,
        type: 'improvement',
        title: `${metricName}已恢复至正常范围`,
        description: `从 ${previous.valueNumeric} 变为 ${latest.valueNumeric}，现已回到参考区间内。`,
        metricCode: code,
        status: 'normal',
      });
      continue;
    }

    // Insight: Metric became abnormal
    if (!previous.isAbnormal && latest.isAbnormal) {
      insights.push({
        id: `abnormal-${code}`,
        type: 'alert',
        title: `${metricName}目前超出正常范围`,
        description: `从 ${previous.valueNumeric} 变为 ${latest.valueNumeric}，已被标记异常。`,
        metricCode: code,
        status: 'warning',
      });
      continue;
    }

    // Insight: Significant improvement (> 10% toward range)
    if (latest.isAbnormal && refLow != null && refHigh != null) {
      const mid = (refLow + refHigh) / 2;
      const prevDist = Math.abs(previous.valueNumeric - mid);
      const latDist = Math.abs(latest.valueNumeric - mid);

      if (latDist < prevDist && (prevDist - latDist) / prevDist > 0.1) {
        insights.push({
          id: `improving-${code}`,
          type: 'improvement',
          title: `${metricName}正逐步趋向正常`,
          description: `变化了 ${Math.abs(Math.round(changePct))}%，正在靠近参考区间。`,
          metricCode: code,
          status: 'info',
        });
        continue;
      }
    }

    // Insight: Significant decline (> 15% change, staying abnormal)
    if (Math.abs(changePct) > 15 && latest.isAbnormal) {
      insights.push({
        id: `decline-${code}`,
        type: 'decline',
        title: `${metricName}变化了 ${Math.abs(Math.round(changePct))}%`,
        description: `从 ${previous.valueNumeric} 变为 ${latest.valueNumeric}，仍处于异常状态。`,
        metricCode: code,
        status: 'warning',
      });
      continue;
    }

    // Insight: Stable at healthy level for 3+ readings
    if (sorted.length >= 3 && !latest.isAbnormal) {
      const last3 = sorted.slice(-3);
      const allNormal = last3.every((o) => !o.isAbnormal);
      if (allNormal) {
        const values = last3.map((o) => o.valueNumeric!);
        const avg = values.reduce((s, v) => s + v, 0) / values.length;
        const maxDeviation = Math.max(...values.map((v) => Math.abs(v - avg)));
        const isStable = Math.abs(avg) > 0 ? maxDeviation / Math.abs(avg) < 0.05 : true;

        if (isStable) {
          insights.push({
            id: `stable-${code}`,
            type: 'milestone',
            title: `${metricName}持续保持正常`,
            description: `最近 ${last3.length} 次结果保持稳定。`,
            metricCode: code,
            status: 'normal',
          });
        }
      }
    }
  }

  // Sort: alerts first, then declines, improvements, milestones
  const typeOrder = { alert: 0, decline: 1, improvement: 2, milestone: 3 };
  insights.sort((a, b) => typeOrder[a.type] - typeOrder[b.type]);

  return insights;
}
