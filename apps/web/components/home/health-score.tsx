'use client';

import { cn } from '@/lib/utils';

interface HealthScoreProps {
  /** Score from 0-100 */
  score: number;
  normalCount: number;
  warningCount: number;
  criticalCount: number;
  totalMetrics: number;
}

function getScoreLabel(score: number): string {
  if (score >= 90) return '优秀';
  if (score >= 75) return '良好';
  if (score >= 60) return '一般';
  if (score >= 40) return '需要关注';
  return '存在风险';
}

/** Raw CSS value for SVG stroke/fill */
function getScoreColorCss(score: number): string {
  if (score >= 75) return 'var(--color-health-normal)';
  if (score >= 40) return 'var(--color-health-warning)';
  return 'var(--color-health-critical)';
}

/** Tailwind class for text/border */
function getScoreColorClass(score: number): string {
  if (score >= 75) return 'text-health-normal border-health-normal';
  if (score >= 40) return 'text-health-warning border-health-warning';
  return 'text-health-critical border-health-critical';
}

/**
 * Calculate a health score from 0-100 based on metric statuses.
 * Normal = full weight, Warning = half weight, Critical = no weight
 */
export function calculateHealthScore(
  normalCount: number,
  warningCount: number,
  criticalCount: number,
): number {
  const total = normalCount + warningCount + criticalCount;
  if (total === 0) return 100;
  const score = ((normalCount * 1.0 + warningCount * 0.5 + criticalCount * 0) / total) * 100;
  return Math.round(score);
}

export function HealthScore({
  score,
  normalCount,
  warningCount,
  criticalCount,
  totalMetrics,
}: HealthScoreProps) {
  const label = getScoreLabel(score);
  const svgColor = getScoreColorCss(score);
  const colorClass = getScoreColorClass(score);

  // SVG arc for the gauge
  const radius = 52;
  const strokeWidth = 6;
  const circumference = Math.PI * radius; // half circle
  const progress = (score / 100) * circumference;

  return (
    <div className="card p-5 flex items-center gap-6">
      {/* Gauge */}
      <div className="relative shrink-0">
        <svg width="120" height="68" viewBox="0 0 120 68">
          {/* Background arc */}
          <path
            d={`M ${60 - radius} 64 A ${radius} ${radius} 0 0 1 ${60 + radius} 64`}
            fill="none"
            stroke="var(--color-neutral-100)"
            strokeWidth={strokeWidth}
            strokeLinecap="square"
          />
          {/* Progress arc */}
          <path
            d={`M ${60 - radius} 64 A ${radius} ${radius} 0 0 1 ${60 + radius} 64`}
            fill="none"
            stroke={svgColor}
            strokeWidth={strokeWidth}
            strokeLinecap="square"
            strokeDasharray={`${progress} ${circumference}`}
            style={{ transition: 'stroke-dasharray 0.6s ease' }}
          />
        </svg>
        {/* Score number */}
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
          <span className={cn("text-[28px] font-mono font-bold tabular-nums leading-none", colorClass)}>
            {score}
          </span>
        </div>
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono font-bold uppercase tracking-[0.06em] text-neutral-400">
            Health Score
          </span>
          <span className={cn("text-[10px] font-mono font-bold uppercase tracking-[0.04em] px-1.5 py-0.5 border", colorClass)}>
            {label}
          </span>
        </div>
        <p className="text-[11px] text-neutral-500 font-body mt-1.5">
          Based on {totalMetrics} tracked biomarkers
        </p>
        <div className="flex items-center gap-3 mt-2">
          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-health-normal">
            <span className="size-[5px] bg-health-normal" />
            {normalCount} normal
          </span>
          {warningCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] font-mono text-health-warning">
              <span className="size-[5px] bg-health-warning" />
              {warningCount} warning
            </span>
          )}
          {criticalCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] font-mono text-health-critical">
              <span className="size-[5px] bg-health-critical" />
              {criticalCount} critical
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
