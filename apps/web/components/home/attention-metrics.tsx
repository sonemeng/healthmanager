'use client';

import Link from 'next/link';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { StatusBadge, type HealthStatus } from '@/components/health/status-badge';
import { MiniSparkline } from '@/components/health/mini-sparkline';
import { cn } from '@/lib/utils';

export interface AttentionMetric {
  metricCode: string;
  metricName: string;
  latestValue: number | null;
  unit: string | null;
  status: HealthStatus;
  sparkData: number[];
  daysSinceTest: number | null;
}

interface AttentionMetricsProps {
  metrics: AttentionMetric[];
}

const statusColor: Record<string, string> = {
  normal: 'var(--color-health-normal)',
  warning: 'var(--color-health-warning)',
  critical: 'var(--color-health-critical)',
};

export function AttentionMetrics({ metrics }: AttentionMetricsProps) {
  if (metrics.length === 0) return null;

  return (
    <div className="card">
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-3.5 text-health-warning" />
          <h2 className="text-[13px] font-semibold text-neutral-900 font-display">
            需要关注
          </h2>
          <span className="bg-neutral-100 px-2 py-0.5 text-[10px] font-mono font-bold text-neutral-500 tabular-nums">
            {metrics.length}
          </span>
        </div>
        <Link
          href="/labs"
          className="text-[11px] font-mono text-neutral-400 hover:text-neutral-600 transition-colors flex items-center gap-1"
        >
          查看全部
          <ChevronRight className="size-3" />
        </Link>
      </div>
      <div className="divide-y divide-neutral-100">
        {metrics.slice(0, 6).map((m) => (
          <Link
            key={m.metricCode}
            href={`/labs/${m.metricCode}`}
            className="flex items-center px-4 py-3 hover:bg-neutral-50 transition-colors group"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium text-neutral-900 font-body truncate">
                  {m.metricName}
                </span>
                <StatusBadge status={m.status} label={m.status} />
              </div>
              {m.daysSinceTest !== null && (
                <span className="text-[10px] font-mono text-neutral-400 mt-0.5 block">
                  {m.daysSinceTest === 0 ? '今天' : `${m.daysSinceTest} 天前`}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {m.sparkData.length >= 2 && (
                <MiniSparkline
                  data={m.sparkData}
                  color={statusColor[m.status] ?? statusColor.normal}
                  width={64}
                  height={20}
                />
              )}
              <div className="text-right min-w-[60px]">
                <span className="text-[14px] font-mono font-semibold text-neutral-900 tabular-nums">
                  {m.latestValue != null ? m.latestValue : '—'}
                </span>
                {m.unit && (
                  <span className="text-[10px] font-mono text-neutral-400 ml-1">
                    {m.unit}
                  </span>
                )}
              </div>
              <ChevronRight className="size-3.5 text-neutral-300 group-hover:text-neutral-500 transition-colors" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
