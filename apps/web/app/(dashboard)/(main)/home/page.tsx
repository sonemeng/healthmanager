'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
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
  const activeProfile = trpc.profiles.active.useQuery();
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
  const healthReport = trpc.ai.latestHealthReport.useQuery();

  const isLoading = observations.isLoading || medications.isLoading || importJobs.isLoading;

  const obsItems = observations.data?.items ?? [];
  const medItems = medications.data?.items ?? [];
  const jobItems = importJobs.data?.items ?? [];
  const retestItems = retests.data ?? [];
  const metricDefsList = metricDefs.data ?? [];
  const condItems = conditionsQuery.data ?? [];
  const hasData = obsItems.length > 0;
  const isFamilyMember = Boolean(activeProfile.data && !activeProfile.data.isDefault);
  const recordCount = obsItems.length + medItems.length + condItems.length + jobItems.length;
  const dataLevel = recordCount === 0 ? 'empty' : obsItems.length < 5 ? 'limited' : 'complete';

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
  const fullName = activeProfile.data?.name ?? '';
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
    { label: '生成健康报告', description: '生成综合健康报告，就诊时可直接分享给医生。', href: '/reports', completed: Boolean(healthReport.data), icon: FileText },
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

      {dataLevel === 'complete' ? (
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
      ) : dataLevel === 'limited' ? (
        <div className="mt-6 card p-7">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div><p className="text-[11px] font-mono font-semibold uppercase tracking-[0.06em] text-accent-700">正在建立档案</p><h2 className="mt-2 text-[18px] font-display font-semibold text-neutral-900">已有少量健康记录，继续补充可获得趋势和复查建议</h2><p className="mt-2 max-w-2xl text-[13px] leading-6 text-neutral-500">当前已记录 {recordCount} 项资料。导入更多检验结果或完善用药、病史后，首页将展示完整健康概览。</p></div>
            <div className="flex shrink-0 flex-wrap gap-2"><Link href="/uploads" className="rounded-lg bg-accent-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-accent-700">继续导入</Link><Link href="/settings" className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50">完善资料</Link></div>
          </div>
        </div>
      ) : isFamilyMember ? (
        <div className="mt-6 card p-8 text-center">
          <HeartPulse className="mx-auto size-9 text-accent-500" />
          <h2 className="mt-3 text-[18px] font-semibold text-neutral-900 font-display">
            {activeProfile.data?.name} 的健康档案尚无记录
          </h2>
          <p className="mx-auto mt-2 max-w-md text-[13px] text-neutral-500 font-body">
            从一份体检报告、正在服用的药物、既往病史或就诊记录开始，为这位家庭成员建立独立健康档案。
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link href="/uploads" className="rounded-lg bg-accent-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-accent-700">导入报告</Link>
            <Link href="/medications" className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50">添加用药</Link>
            <Link href="/conditions" className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50">记录病史</Link>
            <Link href="/encounters" className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50">添加就诊</Link>
          </div>
        </div>
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
