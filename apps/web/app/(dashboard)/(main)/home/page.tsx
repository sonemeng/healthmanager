'use client';

import { useMemo } from 'react';
import { trpc } from '@/lib/trpc/client';
import { useSession } from '@/lib/auth/client';
import { deriveStatus } from '@/lib/health-utils';
import { GreetingHeader } from '@/components/home/greeting-header';
import { OnboardingChecklist, type ChecklistItem } from '@/components/home/onboarding-checklist';
import { DashboardStats } from '@/components/home/dashboard-stats';
import { AttentionMetrics, type AttentionMetric } from '@/components/home/attention-metrics';
import { CategoryOverview } from '@/components/home/category-overview';
import { UpcomingRetests, type RetestItem } from '@/components/home/upcoming-retests';
import { HealthInsights, generateInsights } from '@/components/home/health-insights';
import { HealthScore, calculateHealthScore } from '@/components/home/health-score';
import { AdherenceSummary } from '@/components/home/adherence-summary';
import { FeaturePreviewCard } from '@/components/home/feature-preview-card';
import {
  LabsPreviewContent,
  MedicationsPreviewContent,
  UploadsPreviewContent,
  AIChatPreviewContent,
} from '@/components/home/feature-cards';
import { TestTubes, Pill, Upload, MessageSquare, ListChecks, HeartPulse, FileText } from 'lucide-react';

export default function HomePage() {
  const { data: session } = useSession();
  const observations = trpc.observations.list.useQuery({ limit: 200 });
  const medications = trpc.medications.list.useQuery({});
  const importJobs = trpc.importJobs.list.useQuery({ limit: 20 });
  const retests = trpc.testing['retest.getRecommendations'].useQuery(undefined, {
    enabled: (observations.data?.items?.length ?? 0) > 0,
  });
  const metricDefs = trpc.metrics.list.useQuery(undefined, {
    enabled: (observations.data?.items?.length ?? 0) > 0,
  });
  const conditionsQuery = trpc.conditions.list.useQuery();

  const isLoading = observations.isLoading || medications.isLoading || importJobs.isLoading;

  const obsItems = observations.data?.items ?? [];
  const medItems = medications.data?.items ?? [];
  const jobItems = importJobs.data?.items ?? [];
  const retestItems = retests.data ?? [];
  const metricDefsList = metricDefs.data ?? [];
  const condItems = conditionsQuery.data ?? [];
  const hasData = obsItems.length > 0;

  // Build metric name lookup
  const metricNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const def of metricDefsList) {
      map.set(def.id, def.name);
    }
    return map;
  }, [metricDefsList]);

  // Aggregate stats
  const stats = useMemo(() => {
    const metricCodes = new Set(obsItems.map((o) => o.metricCode));
    let flaggedCount = 0;
    let criticalCount = 0;
    let warningCount = 0;
    let normalCount = 0;

    // Group by metric to get latest observation per metric
    const byMetric = new Map<string, typeof obsItems>();
    for (const obs of obsItems) {
      const existing = byMetric.get(obs.metricCode) ?? [];
      existing.push(obs);
      byMetric.set(obs.metricCode, existing);
    }

    // Count flagged/critical based on latest per metric
    for (const [, metricObs] of byMetric) {
      const sorted = [...metricObs].sort(
        (a, b) => new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime(),
      );
      const latest = sorted[0]!;
      const status = deriveStatus(latest);
      if (status === 'critical') {
        criticalCount++;
        flaggedCount++;
      } else if (status === 'warning') {
        warningCount++;
        flaggedCount++;
      } else {
        normalCount++;
      }
    }

    const activeMeds = medItems.filter((m) => m.isActive).length;
    const retestsDue = retestItems.filter(
      (r) => r.urgency === 'overdue' || r.urgency === 'due_soon',
    ).length;

    return {
      metricCount: metricCodes.size,
      flaggedCount,
      criticalCount,
      warningCount,
      normalCount,
      activeMedCount: activeMeds,
      retestsDueCount: retestsDue,
      byMetric,
    };
  }, [obsItems, medItems, retestItems]);

  // Attention metrics (flagged, sorted by severity)
  const attentionMetrics = useMemo<AttentionMetric[]>(() => {
    const result: AttentionMetric[] = [];
    const now = Date.now();

    for (const [code, metricObs] of stats.byMetric) {
      const sorted = [...metricObs].sort(
        (a, b) => new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime(),
      );
      const latest = sorted[0]!;
      const status = deriveStatus(latest);
      if (status === 'normal') continue;

      const sparkData = sorted.slice(0, 8).reverse().map((o) => o.valueNumeric ?? 0);
      const daysSinceTest = Math.floor(
        (now - new Date(latest.observedAt).getTime()) / (1000 * 60 * 60 * 24),
      );

      result.push({
        metricCode: code,
        metricName: metricNameMap.get(code) ?? code.replace(/_/g, ' '),
        latestValue: latest.valueNumeric ?? null,
        unit: latest.unit ?? null,
        status,
        sparkData,
        daysSinceTest,
      });
    }

    // Sort: critical first, then warning
    return result.sort((a, b) => {
      const order = { critical: 0, warning: 1, normal: 2, info: 3, neutral: 4 };
      return (order[a.status] ?? 4) - (order[b.status] ?? 4);
    });
  }, [stats.byMetric, metricNameMap]);

  // Category stats
  const categoryStats = useMemo(() => {
    const catMap = new Map<string, { total: number; normal: number; warning: number; critical: number }>();

    for (const [code, metricObs] of stats.byMetric) {
      const sorted = [...metricObs].sort(
        (a, b) => new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime(),
      );
      const latest = sorted[0]!;
      const category = latest.category ?? 'other';
      const status = deriveStatus(latest);

      const existing = catMap.get(category) ?? { total: 0, normal: 0, warning: 0, critical: 0 };
      existing.total++;
      if (status === 'critical') existing.critical++;
      else if (status === 'warning') existing.warning++;
      else existing.normal++;
      catMap.set(category, existing);
    }

    return Array.from(catMap.entries())
      .map(([category, data]) => ({ category, ...data }))
      .sort((a, b) => (b.warning + b.critical) - (a.warning + a.critical) || b.total - a.total);
  }, [stats.byMetric]);

  // Retest items for dashboard
  const upcomingRetests = useMemo<RetestItem[]>(() => {
    return retestItems
      .filter((r) => !r.isPaused)
      .map((r) => ({
        metricCode: r.metricCode,
        metricName: r.metricName,
        urgency: r.urgency,
        dueInDays: r.dueInDays,
        daysSinceLastTest: r.daysSinceLastTest,
        healthStatus: r.healthStatus,
      }));
  }, [retestItems]);

  // Health insights
  const healthInsights = useMemo(() => {
    if (!hasData) return [];
    return generateInsights(stats.byMetric, metricNameMap);
  }, [hasData, stats.byMetric, metricNameMap]);

  // Derive display values
  const fullName = session?.user?.name ?? '';
  const firstName = fullName.split(/\s+/)[0] ?? '';
  const activeConds = condItems.filter((c) => c.status === 'active').length;
  const summaryParts = [];
  if (hasData) summaryParts.push(`${stats.metricCount} 项指标`);
  if (stats.activeMedCount > 0) summaryParts.push(`${stats.activeMedCount} 种在用药物`);
  if (activeConds > 0) summaryParts.push(`${activeConds} 项病史记录`);
  const summaryLine = summaryParts.length > 0
    ? summaryParts.join(' · ')
    : '上传第一份体检报告开始使用';
  const abnormalCount = obsItems.filter((o) => o.isAbnormal).length;

  // Onboarding checklist items
  const checklistItems: ChecklistItem[] = [
    { label: '上传体检报告', description: '导入你的检验结果，开始长期追踪健康指标变化。', href: '/uploads', completed: jobItems.length > 0, icon: Upload },
    { label: '添加用药记录', description: '记录你正在使用的药物与补剂，让 AI 洞察结合用药分析。', href: '/medications', completed: medItems.length > 0, icon: Pill },
    { label: '记录病史', description: '记录你的健康状况与诊断，构建完整的健康档案。', href: '/conditions', completed: condItems.length > 0, icon: HeartPulse },
    { label: '查看生物标志物', description: '按分类浏览检验结果，附参考区间和趋势图。', href: '/biomarkers', completed: obsItems.length > 0, icon: ListChecks },
    { label: '生成健康报告', description: '生成综合健康报告，就诊时可直接分享给医生。', href: '/reports', completed: false, icon: FileText },
    { label: '向 AI 提问', description: '与你的健康数据对话——询问趋势、寻求解释或获取总结。', href: '/ai', completed: false, icon: MessageSquare },
  ];

  if (isLoading) {
    return (
      <div>
        <div className="card h-20 animate-pulse bg-neutral-50" />
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-0">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card h-24 animate-pulse bg-neutral-50" />
          ))}
        </div>
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card h-48 animate-pulse bg-neutral-50" />
          <div className="card h-48 animate-pulse bg-neutral-50" />
        </div>
      </div>
    );
  }

  return (
    <div className="stagger-children">
      <GreetingHeader
        firstName={firstName}
        summaryLine={summaryLine}
        abnormalCount={abnormalCount}
      />

      {/* Onboarding checklist (shown until dismissed or complete) */}
      <div className="mt-6">
        <OnboardingChecklist items={checklistItems} />
      </div>

      {hasData ? (
        <>
          {/* Health score + Stats overview */}
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-4">
            <HealthScore
              score={calculateHealthScore(stats.normalCount, stats.warningCount, stats.criticalCount)}
              normalCount={stats.normalCount}
              warningCount={stats.warningCount}
              criticalCount={stats.criticalCount}
              totalMetrics={stats.metricCount}
            />
            <DashboardStats
              metricCount={stats.metricCount}
              totalResults={obsItems.length}
              flaggedCount={stats.flaggedCount}
              criticalCount={stats.criticalCount}
              warningCount={stats.warningCount}
              activeMedCount={stats.activeMedCount}
              discontinuedMedCount={medItems.filter((m) => !m.isActive).length}
              retestsDueCount={stats.retestsDueCount}
              overdueCount={retestItems.filter((r) => r.urgency === 'overdue').length}
            />
          </div>

          {/* Insights + Attention + Categories / Retests */}
          {healthInsights.length > 0 && (
            <div className="mt-4">
              <HealthInsights insights={healthInsights} />
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-4">
              <AttentionMetrics metrics={attentionMetrics} />
              <CategoryOverview categories={categoryStats} />
            </div>
            <div className="space-y-4">
              <UpcomingRetests items={upcomingRetests} />

              {/* Adherence + Quick links */}
              <AdherenceSummary
                activeMedications={medItems.filter((m) => m.isActive).map((m) => ({ id: m.id, name: m.name }))}
              />
              <div className="grid grid-cols-2 gap-4">
                <FeaturePreviewCard title="报告上传" href="/uploads" icon={Upload}>
                  <UploadsPreviewContent items={jobItems} />
                </FeaturePreviewCard>
                <FeaturePreviewCard title="AI 问答" href="/ai" icon={MessageSquare}>
                  <AIChatPreviewContent />
                </FeaturePreviewCard>
              </div>
            </div>
          </div>
        </>
      ) : (
        /* Feature cards grid for new users */
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <FeaturePreviewCard
            title="检验结果"
            href="/labs"
            icon={TestTubes}
            className="lg:col-span-2"
          >
            <LabsPreviewContent items={obsItems} />
          </FeaturePreviewCard>

          <FeaturePreviewCard title="用药记录" href="/medications" icon={Pill}>
            <MedicationsPreviewContent items={medItems} />
          </FeaturePreviewCard>

          <FeaturePreviewCard title="报告上传" href="/uploads" icon={Upload}>
            <UploadsPreviewContent items={jobItems} />
          </FeaturePreviewCard>

          <FeaturePreviewCard title="AI 问答" href="/ai" icon={MessageSquare}>
            <AIChatPreviewContent />
          </FeaturePreviewCard>
        </div>
      )}
    </div>
  );
}
