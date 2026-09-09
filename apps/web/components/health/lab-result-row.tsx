import { StatusBadge, type HealthStatus } from './status-badge';
import { MiniSparkline } from './mini-sparkline';

interface LabResultRowProps {
  metric: string;
  value: string;
  unit: string;
  range: string;
  trend: number[];
  status: HealthStatus;
  date: string;
}

const statusLabel: Record<string, string> = {
  normal: 'Normal',
  warning: 'Borderline',
  critical: 'High',
  info: 'New',
};

const trendColor: Record<string, string> = {
  normal: 'var(--color-health-normal)',
  warning: 'var(--color-health-warning)',
  critical: 'var(--color-health-critical)',
  info: 'var(--color-health-info)',
};

export function LabResultRow({ metric, value, unit, range, trend, status, date }: LabResultRowProps) {
  return (
    <div className="grid grid-cols-[1.6fr_0.9fr_1.2fr_0.8fr_1fr] items-center gap-3 border-b border-neutral-100 px-5 py-3.5 transition-colors hover:bg-neutral-50 cursor-pointer">
      <div>
        <div className="text-sm font-medium text-neutral-900 font-body">
          {metric}
        </div>
        <div className="mt-0.5 text-[11px] text-neutral-400 font-mono">
          {date}
        </div>
      </div>
      <div className="flex items-baseline gap-1">
        <span
          className="text-base font-semibold tracking-[-0.01em]"
          style={{
            fontFamily: 'var(--font-mono)',
            color: status === 'normal' ? 'var(--color-neutral-900)' : status === 'warning' ? 'var(--color-health-warning)' : 'var(--color-health-critical)',
          }}
        >
          {value}
        </span>
        <span className="text-[11px] text-neutral-400 font-mono">
          {unit}
        </span>
      </div>
      <div className="text-xs text-neutral-400 font-mono">
        {range}
      </div>
      <StatusBadge status={status} label={statusLabel[status] ?? status} />
      <div className="flex justify-end">
        <MiniSparkline data={trend} color={trendColor[status] ?? trendColor.normal!} />
      </div>
    </div>
  );
}

export function LabResultHeader() {
  return (
    <div className="grid grid-cols-[1.6fr_0.9fr_1.2fr_0.8fr_1fr] gap-3 border-b border-neutral-200 bg-neutral-50 px-5 py-2.5">
      {['Metric', 'Value', 'Reference range', 'Status', 'Trend'].map((h) => (
        <div
          key={h}
          className="text-[11px] font-semibold uppercase tracking-[0.04em] text-neutral-400 font-mono"
        >
          {h}
        </div>
      ))}
    </div>
  );
}
