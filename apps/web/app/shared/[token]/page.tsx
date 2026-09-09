'use client';

import { use, useMemo } from 'react';
import { trpc } from '@/lib/trpc/client';
import { StatusBadge, type HealthStatus } from '@/components/health/status-badge';
import { MiniSparkline } from '@/components/health/mini-sparkline';
import { deriveStatus } from '@/lib/health-utils';
import { cn, formatDate, formatObsValue } from '@/lib/utils';
import { LogoWordmark } from '@/assets/app/images/logo';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  Shield,
  Clock,
  Eye,
  Download,
  Lock,
  TestTubes,
  Pill,
  HeartPulse,
  AlertTriangle,
} from 'lucide-react';

const CATEGORY_LABELS: Record<string, string> = {
  lab_results: 'Lab Results',
  vital_signs: 'Vital Signs',
  medications: 'Medications',
  conditions: 'Conditions',
  encounters: 'Encounters',
  wearable: 'Wearable Data',
};

const statusColor: Record<string, string> = {
  normal: 'var(--color-health-normal)',
  warning: 'var(--color-health-warning)',
  critical: 'var(--color-health-critical)',
};

const accessLevelLabels: Record<string, { label: string; icon: typeof Eye }> = {
  view: { label: 'Trends Only', icon: Eye },
  view_download: { label: 'Full Values', icon: Download },
  full: { label: 'Full Access', icon: Lock },
};

export default function SharedDataPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const { data, isLoading, error } = trpc.sharing.getSharedData.useQuery({ token });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-center">
          <div className="size-8 border-2 border-accent-300 border-t-accent-600 animate-spin mx-auto mb-4" />
          <p className="text-[13px] text-neutral-500 font-body">Loading shared data...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-6">
        <div className="card p-8 text-center max-w-md w-full">
          <Shield className="size-10 text-neutral-300 mx-auto mb-4" />
          <h1 className="text-[18px] font-display font-semibold text-neutral-900">
            Share link unavailable
          </h1>
          <p className="text-[13px] text-neutral-500 font-body mt-2">
            {error?.message ?? 'This share link may have expired or been revoked.'}
          </p>
          <Button asChild className="mt-4">
            <Link href="/">Go to OpenVitals</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SharedDataView data={data} />
  );
}

function SharedDataView({
  data,
}: {
  data: {
    sharerName: string;
    policyName: string;
    categories: string[];
    accessLevel: string | null;
    observations: Array<{
      metricCode: string;
      category: string | null;
      isAbnormal: boolean | null;
      unit: string | null;
      observedAt: Date;
      referenceRangeLow: number | null;
      referenceRangeHigh: number | null;
      valueNumeric: number | null;
      valueText: string | null;
    }>;
    medications: Array<{
      name: string;
      dosage: string | null;
      frequency: string | null;
      isActive: boolean | null;
      startDate: string | null;
    }>;
    conditions: Array<{
      name: string;
      severity: string | null;
      status: string | null;
      onsetDate: string | null;
    }>;
  };
}) {
  const accessInfo = accessLevelLabels[data.accessLevel ?? 'view'] ?? accessLevelLabels.view;
  const AccessIcon = accessInfo.icon;
  const isViewOnly = data.accessLevel === 'view';

  // Group observations by metric
  const byMetric = useMemo(() => {
    const map = new Map<string, typeof data.observations>();
    for (const obs of data.observations) {
      const existing = map.get(obs.metricCode) ?? [];
      existing.push(obs);
      map.set(obs.metricCode, existing);
    }
    return map;
  }, [data.observations]);

  // Group by category
  const byCategory = useMemo(() => {
    const catMap = new Map<string, Array<{
      metricCode: string;
      metricName: string;
      latestValue: number | null;
      valueText: string | null;
      unit: string | null;
      status: HealthStatus;
      sparkData: number[];
      refLow: number | null;
      refHigh: number | null;
      observedAt: Date;
    }>>();

    for (const [code, metricObs] of byMetric) {
      const sorted = [...metricObs].sort(
        (a, b) => new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime(),
      );
      const latest = sorted[0]!;
      const status = deriveStatus(latest);
      const sparkData = sorted.slice(0, 8).reverse().map((o) => o.valueNumeric ?? 0);
      const category = latest.category ?? 'other';

      const existing = catMap.get(category) ?? [];
      existing.push({
        metricCode: code,
        metricName: code.replace(/_/g, ' '),
        latestValue: latest.valueNumeric,
        valueText: latest.valueText,
        unit: latest.unit,
        status,
        sparkData,
        refLow: latest.referenceRangeLow,
        refHigh: latest.referenceRangeHigh,
        observedAt: latest.observedAt,
      });
      catMap.set(category, existing);
    }

    return Array.from(catMap.entries()).map(([cat, metrics]) => ({
      category: cat,
      metrics: metrics.sort((a, b) => {
        const order = { critical: 0, warning: 1, normal: 2 };
        return (order[a.status as keyof typeof order] ?? 2) - (order[b.status as keyof typeof order] ?? 2);
      }),
    }));
  }, [byMetric]);

  const totalMetrics = byMetric.size;
  const flaggedCount = Array.from(byMetric.values()).filter((obs) => {
    const latest = [...obs].sort(
      (a, b) => new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime(),
    )[0];
    return latest?.isAbnormal;
  }).length;

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <header className="bg-white border-b border-neutral-200 px-4 py-4 md:px-8">
        <div className="max-w-[1200px] mx-auto flex items-center justify-between">
          <Link href="/">
            <LogoWordmark
              className="gap-2"
              logoProps={{ className: 'size-5' }}
              workmarkProps={{ className: 'text-[14px] tracking-[-0.01em]' }}
            />
          </Link>
          <div className="flex items-center gap-2">
            <AccessIcon className="size-3.5 text-neutral-400" />
            <span className="text-[11px] font-mono text-neutral-500">{accessInfo.label}</span>
          </div>
        </div>
      </header>

      <div className="max-w-[1200px] mx-auto px-4 py-8 md:px-8">
        {/* Share info */}
        <div className="card p-6 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.06em] text-neutral-400">
                Shared Health Data
              </span>
              <h1 className="text-[22px] font-display font-semibold text-neutral-900 tracking-[-0.02em] mt-1">
                {data.policyName}
              </h1>
              <p className="text-[13px] text-neutral-500 font-body mt-1">
                Shared by <span className="font-medium text-neutral-700">{data.sharerName}</span>
              </p>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-mono text-neutral-400">
              <Clock className="size-3" />
              Viewed {formatDate(new Date())}
            </div>
          </div>

          {/* Summary stats */}
          <div className="mt-4 pt-4 border-t border-neutral-200 grid grid-cols-3 gap-4">
            <div>
              <span className="text-[10px] font-mono font-bold uppercase text-neutral-400">Biomarkers</span>
              <p className="text-[22px] font-mono font-semibold text-neutral-900 tabular-nums">{totalMetrics}</p>
            </div>
            <div>
              <span className="text-[10px] font-mono font-bold uppercase text-neutral-400">Flagged</span>
              <p className={cn("text-[22px] font-mono font-semibold tabular-nums", flaggedCount > 0 ? 'text-health-warning' : 'text-health-normal')}>
                {flaggedCount}
              </p>
            </div>
            <div>
              <span className="text-[10px] font-mono font-bold uppercase text-neutral-400">Categories</span>
              <p className="text-[22px] font-mono font-semibold text-neutral-900 tabular-nums">{data.categories.length}</p>
            </div>
          </div>
        </div>

        {/* Observations by category */}
        {byCategory.map(({ category, metrics }) => (
          <div key={category} className="card mb-4">
            <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TestTubes className="size-3.5 text-neutral-400" />
                <h2 className="text-[14px] font-display font-semibold text-neutral-900">
                  {CATEGORY_LABELS[category] ?? category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </h2>
              </div>
              <span className="text-[10px] font-mono text-neutral-400">{metrics.length} metrics</span>
            </div>

            {/* Table header */}
            <div className="grid grid-cols-[1fr_100px_120px_80px_64px] gap-2 px-4 py-2 border-b border-neutral-100">
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.06em] text-neutral-400">Metric</span>
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.06em] text-neutral-400 text-right">
                {isViewOnly ? '' : 'Value'}
              </span>
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.06em] text-neutral-400 text-right">Reference</span>
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.06em] text-neutral-400 text-center">Status</span>
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.06em] text-neutral-400 text-right">Trend</span>
            </div>

            {metrics.map((m) => {
              const refRange = m.refLow != null && m.refHigh != null
                ? `${m.refLow} – ${m.refHigh}`
                : m.refLow != null ? `> ${m.refLow}` : m.refHigh != null ? `< ${m.refHigh}` : '—';

              return (
                <div key={m.metricCode} className="grid grid-cols-[1fr_100px_120px_80px_64px] gap-2 items-center px-4 py-2.5 border-b border-neutral-50 last:border-0">
                  <div>
                    <span className="text-[12px] font-medium text-neutral-800 font-body capitalize">
                      {m.metricName}
                    </span>
                    <span className="text-[10px] font-mono text-neutral-400 ml-2">
                      {formatDate(m.observedAt)}
                    </span>
                  </div>
                  <div className="text-right">
                    {isViewOnly ? (
                      <span className="text-[11px] font-mono text-neutral-400">—</span>
                    ) : (
                      <>
                        <span className="text-[13px] font-mono font-semibold text-neutral-900 tabular-nums">
                          {m.latestValue != null ? m.latestValue : m.valueText ?? '—'}
                        </span>
                        {m.unit && (
                          <span className="text-[10px] font-mono text-neutral-400 ml-1">{m.unit}</span>
                        )}
                      </>
                    )}
                  </div>
                  <span className="text-[11px] font-mono text-neutral-500 text-right tabular-nums">{refRange}</span>
                  <div className="flex justify-center">
                    <StatusBadge status={m.status} label={m.status} />
                  </div>
                  <div className="flex justify-end">
                    {m.sparkData.length >= 2 && (
                      <MiniSparkline
                        data={m.sparkData}
                        color={statusColor[m.status] ?? statusColor.normal}
                        width={56}
                        height={18}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {/* Medications */}
        {data.medications.length > 0 && (
          <div className="card mb-4">
            <div className="px-4 py-3 border-b border-neutral-200 flex items-center gap-2">
              <Pill className="size-3.5 text-neutral-400" />
              <h2 className="text-[14px] font-display font-semibold text-neutral-900">Medications</h2>
            </div>
            <div className="divide-y divide-neutral-50">
              {data.medications.map((med, i) => (
                <div key={i} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <span className="text-[13px] font-medium text-neutral-800 font-body">{med.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {med.dosage && <span className="text-[11px] font-mono text-neutral-500">{med.dosage}</span>}
                    {med.frequency && <span className="text-[10px] font-mono text-neutral-400">{med.frequency}</span>}
                    <StatusBadge
                      status={med.isActive ? 'normal' : 'neutral'}
                      label={med.isActive ? 'Active' : 'Ended'}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Conditions */}
        {data.conditions.length > 0 && (
          <div className="card mb-4">
            <div className="px-4 py-3 border-b border-neutral-200 flex items-center gap-2">
              <HeartPulse className="size-3.5 text-neutral-400" />
              <h2 className="text-[14px] font-display font-semibold text-neutral-900">Conditions</h2>
            </div>
            <div className="divide-y divide-neutral-50">
              {data.conditions.map((cond, i) => (
                <div key={i} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <span className="text-[13px] font-medium text-neutral-800 font-body">{cond.name}</span>
                    {cond.onsetDate && (
                      <span className="text-[10px] font-mono text-neutral-400 ml-2">Since {formatDate(cond.onsetDate)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {cond.severity && (
                      <StatusBadge
                        status={cond.severity === 'severe' ? 'critical' : cond.severity === 'moderate' ? 'warning' : 'info'}
                        label={cond.severity}
                      />
                    )}
                    <StatusBadge
                      status={cond.status === 'active' ? 'warning' : 'normal'}
                      label={cond.status ?? 'active'}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-[10px] font-mono text-neutral-400">
            This data was shared via OpenVitals. It is provided for informational purposes only.
          </p>
          <Link
            href="/"
            className="text-[11px] font-mono text-accent-600 hover:text-accent-700 transition-colors mt-1 inline-block"
          >
            openvitals.com
          </Link>
        </div>
      </div>
    </div>
  );
}
