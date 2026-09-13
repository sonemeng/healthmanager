'use client';

import { useMemo, useRef, useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { useSession } from '@/lib/auth/client';
import { deriveStatus } from '@/lib/health-utils';
import { formatDate, formatObsValue } from '@/lib/utils';
import { StatusBadge, type HealthStatus } from '@/components/health/status-badge';
import { MiniSparkline } from '@/components/health/mini-sparkline';
import { Printer, FileText, Sparkles, Copy, Download } from 'lucide-react';
import { Button } from '@/components/button';
import { cn } from '@/lib/utils';
import { calculateHealthScore } from '@/components/home/health-score';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { downloadText } from '@/lib/export';

const CATEGORY_LABELS: Record<string, string> = {
  blood_chemistry: '血液生化',
  hematology: '血常规',
  endocrine: '内分泌',
  vitamins_minerals: '维生素与矿物质',
  inflammation: '炎症',
  liver: '肝脏',
  kidney: '肾脏',
  cardiac: '心脏',
  iron_studies: '铁代谢',
  urinalysis: '尿液分析',
  thyroid: '甲状腺',
  metabolic: '代谢',
  lipid: '血脂',
  cbc: '血常规',
  lab_result: '检验结果',
};

function getCategoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] ?? cat;
}

const statusColor: Record<string, string> = {
  normal: 'var(--color-health-normal)',
  warning: 'var(--color-health-warning)',
  critical: 'var(--color-health-critical)',
};

interface MetricRow {
  metricCode: string;
  metricName: string;
  latestValue: number | null;
  valueText: string | null;
  unit: string | null;
  status: HealthStatus;
  refLow: number | null;
  refHigh: number | null;
  observedAt: string | Date;
  sparkData: number[];
  displayPrecision: number | null;
}

interface CategoryGroup {
  category: string;
  metrics: MetricRow[];
  normalCount: number;
  flaggedCount: number;
}

const DATE_RANGES = [
  { key: 'all', label: '全部时间' },
  { key: '3m', label: '近 3 个月', months: 3 },
  { key: '6m', label: '近 6 个月', months: 6 },
  { key: '1y', label: '近一年', months: 12 },
] as const;

type DateRangeKey = (typeof DATE_RANGES)[number]['key'];

export default function ReportsPage() {
  const { data: session } = useSession();
  const activeProfile = trpc.profiles.active.useQuery();
  const observations = trpc.observations.list.useQuery({ limit: 200 });
  const medications = trpc.medications.list.useQuery({});
  const conditions = trpc.conditions.list.useQuery();
  const encounters = trpc.encounters.list.useQuery();
  const preferences = trpc.preferences.get.useQuery();
  const metricDefs = trpc.metrics.list.useQuery();
  const retests = trpc.testing['retest.getRecommendations'].useQuery();
  const reportRef = useRef<HTMLDivElement>(null);
  const [dateRange, setDateRange] = useState<DateRangeKey>('all');

  // AI 综合健康分析
  const aiReportQuery = trpc.ai.latestHealthReport.useQuery();
  const genReportMutation = trpc.ai.healthReport.useMutation({
    onSuccess: () => {
      toast.success('AI 综合健康分析已生成');
      aiReportQuery.refetch();
    },
    onError: (e) => toast.error(e.message || '生成失败，请重试'),
  });

  const handleCopyReport = async () => {
    if (!aiReportQuery.data?.content) return;
    try {
      await navigator.clipboard.writeText(aiReportQuery.data.content);
      toast.success('已复制到剪贴板');
    } catch {
      toast.error('复制失败');
    }
  };

  const handleDownloadReport = () => {
    const content = aiReportQuery.data?.content;
    if (!content) return;
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `healthmanager-ai-report-${new Date().toISOString().slice(0, 10)}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadFamilySummary = () => {
    const latest = obsItems
      .slice()
      .sort((a, b) => new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime())
      .slice(0, 20);
    const lines = [
      '# HealthManager 当前档案健康摘要',
      '',
      `生成日期：${new Date().toISOString().slice(0, 10)}`,
      `档案姓名：${activeProfile.data?.name ?? session?.user?.name ?? '未填写'}`,
      activeProfile.data?.birthDate ? `出生日期：${activeProfile.data.birthDate}` : '',
      activeProfile.data?.bloodType ? `血型：${activeProfile.data.bloodType}` : '',
      activeProfile.data?.allergies ? `过敏史：${activeProfile.data.allergies}` : '',
      activeProfile.data?.emergencyContactName ? `紧急联系人：${activeProfile.data.emergencyContactName}${activeProfile.data.emergencyContactPhone ? `，${activeProfile.data.emergencyContactPhone}` : ''}` : '',
      '',
      '## 当前用药',
      activeMeds.length ? activeMeds.map((med) => `- ${med.name}${med.dosage ? `，${med.dosage}` : ''}${med.frequency ? `，${med.frequency}` : ''}${med.indication ? `，用途：${med.indication}` : ''}`).join('\n') : '- 无记录',
      '',
      '## 活动病史',
      condItems.filter((condition) => condition.status === 'active').length ? condItems.filter((condition) => condition.status === 'active').map((condition) => `- ${condition.name}${condition.severity ? `，${condition.severity}` : ''}${condition.onsetDate ? `，起始：${condition.onsetDate}` : ''}${condition.notes ? `，备注：${condition.notes}` : ''}`).join('\n') : '- 无记录',
      '',
      '## 近期就诊',
      encItems.length ? encItems.slice(0, 10).map((encounter) => `- ${encounter.encounterDate}｜${encounter.type.replace(/_/g, ' ')}${encounter.provider ? `｜${encounter.provider}` : ''}${encounter.chiefComplaint ? `｜${encounter.chiefComplaint}` : ''}${encounter.summary ? `\n  ${encounter.summary}` : ''}`).join('\n') : '- 无记录',
      '',
      '## 最新检验记录',
      latest.length ? latest.map((observation) => `- ${formatDate(observation.observedAt)}｜${observation.metricCode}：${observation.valueNumeric ?? observation.valueText ?? '未记录'}${observation.unit ? ` ${observation.unit}` : ''}${observation.isAbnormal ? '（提示异常）' : ''}`).join('\n') : '- 无记录',
      '',
      '## 使用提示',
      '- 本摘要由个人健康档案自动整理，供家人、照护者或就诊时沟通使用。',
      '- 请同时携带原始检查报告；本文件不构成医疗诊断、治疗建议或紧急医疗指引。',
      '- 分享前请确认接收方可信，并注意其中包含个人健康信息。',
    ].filter(Boolean).join('\n');
    downloadText(`healthmanager-${activeProfile.data?.name ?? 'profile'}-summary-${new Date().toISOString().slice(0, 10)}`, lines, 'text/markdown;charset=utf-8', 'md');
  };

  const isLoading = observations.isLoading || medications.isLoading || preferences.isLoading || metricDefs.isLoading;

  // Filter observations by date range
  const allObsItems = observations.data?.items ?? [];
  const obsItems = useMemo(() => {
    const range = DATE_RANGES.find((r) => r.key === dateRange);
    const confirmedItems = allObsItems.filter((item) => item.status !== 'flagged' && item.metricCode !== 'unmatched');
    if (!range || !('months' in range)) return confirmedItems;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - range.months);
    return confirmedItems.filter((o) => new Date(o.observedAt) >= cutoff);
  }, [allObsItems, dateRange]);
  const medItems = medications.data?.items ?? [];
  const condItems = conditions.data ?? [];
  const encItems = encounters.data ?? [];
  const retestItems = retests.data ?? [];
  const prefs = preferences.data;
  const defs = metricDefs.data ?? [];

  // Build metric definitions lookup
  const defMap = useMemo(() => {
    const map = new Map<string, { name: string; unit: string | null; displayPrecision: number | null }>();
    for (const d of defs) {
      map.set(d.id, { name: d.name, unit: d.unit, displayPrecision: d.displayPrecision });
    }
    return map;
  }, [defs]);

  // Build category groups
  const categoryGroups = useMemo<CategoryGroup[]>(() => {
    const byMetric = new Map<string, typeof obsItems>();
    for (const obs of obsItems) {
      const existing = byMetric.get(obs.metricCode) ?? [];
      existing.push(obs);
      byMetric.set(obs.metricCode, existing);
    }

    const catMap = new Map<string, MetricRow[]>();

    for (const [code, metricObs] of byMetric) {
      const sorted = [...metricObs].sort(
        (a, b) => new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime(),
      );
      const latest = sorted[0]!;
      const status = deriveStatus(latest);
      const def = defMap.get(code);
      const sparkData = sorted.slice(0, 8).reverse().map((o) => o.valueNumeric ?? 0);
      const category = latest.category ?? 'other';

      // 显示优先级：识别原文 > 未识别项目 > 字典中文名
      const displayName =
        latest.originalValueText?.trim()
          ? latest.originalValueText
          : code === 'unmatched'
            ? (latest.originalValueText ?? '未识别项目')
            : (def?.name ?? code.replace(/_/g, ' '));

      const row: MetricRow = {
        metricCode: code,
        metricName: displayName,
        latestValue: latest.valueNumeric ?? null,
        valueText: latest.valueText ?? null,
        unit: latest.unit ?? def?.unit ?? null,
        status,
        refLow: latest.referenceRangeLow ?? null,
        refHigh: latest.referenceRangeHigh ?? null,
        observedAt: latest.observedAt,
        sparkData,
        displayPrecision: def?.displayPrecision ?? null,
      };

      const existing = catMap.get(category) ?? [];
      existing.push(row);
      catMap.set(category, existing);
    }

    return Array.from(catMap.entries())
      .map(([category, metrics]) => {
        // Sort: flagged first, then alphabetical
        metrics.sort((a, b) => {
          const aFlag = a.status !== 'normal' ? 0 : 1;
          const bFlag = b.status !== 'normal' ? 0 : 1;
          if (aFlag !== bFlag) return aFlag - bFlag;
          return a.metricName.localeCompare(b.metricName);
        });

        return {
          category,
          metrics,
          normalCount: metrics.filter((m) => m.status === 'normal').length,
          flaggedCount: metrics.filter((m) => m.status !== 'normal').length,
        };
      })
      .sort((a, b) => b.flaggedCount - a.flaggedCount || b.metrics.length - a.metrics.length);
  }, [obsItems, defMap]);

  const activeMeds = medItems.filter((m) => m.isActive);
  const totalMetrics = categoryGroups.reduce((sum, g) => sum + g.metrics.length, 0);
  const totalFlagged = categoryGroups.reduce((sum, g) => sum + g.flaggedCount, 0);
  const totalNormal = categoryGroups.reduce((sum, g) => sum + g.normalCount, 0);
  const totalCritical = categoryGroups.reduce((sum, g) => sum + g.metrics.filter((m) => m.status === 'critical').length, 0);
  const totalWarning = totalFlagged - totalCritical;
  const healthScore = calculateHealthScore(totalNormal, totalWarning, totalCritical);

  const handlePrint = () => {
    const profileName = (activeProfile.data?.name ?? '健康档案').replace(/[\\/:*?"<>|]/g, '-');
    const filename = `HealthManager-${profileName}-${new Date().toISOString().slice(0, 10)}.pdf`;
    if (window.healthManagerDesktop) {
      void window.healthManagerDesktop.exportPdf(filename).then((result) => {
        if (!result.cancelled) toast.success('健康报告已导出为 PDF');
      }).catch(() => toast.error('PDF 导出失败，请重试'));
      return;
    }
    window.print();
  };

  if (isLoading) {
    return (
      <div>
        <div className="card h-16 animate-pulse bg-neutral-50" />
        <div className="mt-4 card h-96 animate-pulse bg-neutral-50" />
      </div>
    );
  }

  if (obsItems.length === 0) {
    return (
      <div className="card p-8 text-center">
        <FileText className="size-8 text-neutral-300 mx-auto mb-3" />
        <h2 className="text-[16px] font-semibold text-neutral-900 font-display">暂无报告数据</h2>
        <p className="text-[13px] text-neutral-500 font-body mt-1">
          请先上传体检报告以生成健康报告。
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Header with print button */}
      <div className="flex items-center justify-between mb-6 print:hidden">
        <div>
          <h1 className="text-[24px] font-display font-medium tracking-[-0.03em] text-neutral-900">
            健康报告
          </h1>
          <p className="text-[13px] text-neutral-500 font-body mt-1">
            综合汇总你的健康数据，可分享给医生
          </p>
        </div>
          <div className="flex items-center gap-2">
          <Button icon={<Download />} text="导出 Markdown" variant="secondary" onClick={handleDownloadFamilySummary} />
          {/* Date range filter */}
          <div className="flex items-center border border-neutral-200 bg-neutral-50 p-0.5">
            {DATE_RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setDateRange(r.key)}
                className={cn(
                  'px-2.5 py-1.5 text-[11px] font-mono font-medium transition-all cursor-pointer',
                  dateRange === r.key
                    ? 'bg-white text-neutral-900'
                    : 'text-neutral-400 hover:text-neutral-600',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <Button
            icon={<Printer />}
            text="导出 PDF"
            onClick={handlePrint}
          />
        </div>
      </div>

      {/* AI 综合健康分析卡片 */}
      <div className="card p-5 mb-4 print:hidden">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Sparkles className="size-5 text-primary mt-0.5" />
            <div>
              <h3 className="text-[15px] font-display font-semibold text-neutral-900">
                AI 综合健康分析
              </h3>
              <p className="text-[12px] text-neutral-500 font-body mt-0.5">
                基于历年指标趋势、病史与用药，生成综合分析与生活建议
              </p>
              {aiReportQuery.data && (
                <p className="text-[11px] font-mono text-neutral-400 mt-1">
                  上次生成：{formatDate(aiReportQuery.data.createdAt)} · {aiReportQuery.data.generatedBy}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {aiReportQuery.data?.content && (
              <>
                <Button icon={<Download />} text="下载 Markdown" variant="secondary" onClick={handleDownloadReport} />
                <Button icon={<Copy />} text="复制" variant="secondary" onClick={handleCopyReport} />
              </>
            )}
            <Button
              icon={<Sparkles />}
              text={genReportMutation.isPending ? '生成中…约 30 秒' : '立即生成'}
              onClick={() => genReportMutation.mutate()}
              disabled={genReportMutation.isPending}
            />
          </div>
        </div>
        {aiReportQuery.data?.content && (
          <div className="mt-4 pt-4 border-t border-neutral-100">
            <div className="text-[13px] leading-relaxed text-neutral-700 font-body">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h2: ({ children }) => <h2 className="mb-2 mt-5 text-base font-semibold text-neutral-900 first:mt-0">{children}</h2>,
                  h3: ({ children }) => <h3 className="mb-1 mt-4 text-sm font-semibold text-neutral-900">{children}</h3>,
                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                  ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5">{children}</ul>,
                  ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5">{children}</ol>,
                }}
              >
                {aiReportQuery.data.content}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>

      {/* Report content */}
      <div ref={reportRef} className="report-content">
        {/* Report header */}
        <div className="card p-6 print:border-0 print:p-0 print:mb-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-[20px] font-display font-semibold text-neutral-900 tracking-[-0.02em]">
                  HealthManager++ 健康报告
                </h2>
              </div>
              <p className="text-[11px] font-mono text-neutral-400 uppercase tracking-[0.06em]">
                生成于 {formatDate(new Date())}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[14px] font-medium text-neutral-900 font-body">
                {activeProfile.data?.name ?? session?.user?.name ?? '患者'}
              </p>
              {(activeProfile.data?.birthDate ?? prefs?.dateOfBirth) && (
                <p className="text-[11px] font-mono text-neutral-500">
                  出生日期：{activeProfile.data?.birthDate ?? prefs?.dateOfBirth}
                </p>
              )}
              {(activeProfile.data?.gender ?? prefs?.biologicalSex) && (
                <p className="text-[11px] font-mono text-neutral-500 capitalize">
                  {(activeProfile.data?.gender ?? prefs?.biologicalSex) === 'male' ? '男' : (activeProfile.data?.gender ?? prefs?.biologicalSex) === 'female' ? '女' : activeProfile.data?.gender ?? prefs?.biologicalSex}
                </p>
              )}
              {(activeProfile.data?.bloodType ?? prefs?.bloodType) && (
                <p className="text-[11px] font-mono text-neutral-500">
                  血型：{activeProfile.data?.bloodType ?? prefs?.bloodType}
                </p>
              )}
            </div>
          </div>

          {/* Summary stats */}
          <div className="mt-4 pt-4 border-t border-neutral-200 grid grid-cols-4 gap-4">
            <div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.06em] text-neutral-500">
                健康评分
              </span>
              <p className={cn(
                "text-[24px] font-mono font-semibold tabular-nums",
                healthScore >= 75 ? 'text-health-normal' : healthScore >= 50 ? 'text-health-warning' : 'text-health-critical',
              )}>
                {healthScore}/100
              </p>
            </div>
            <div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.06em] text-neutral-500">
                指标数
              </span>
              <p className="text-[24px] font-mono font-semibold text-neutral-900 tabular-nums">
                {totalMetrics}
              </p>
            </div>
            <div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.06em] text-neutral-500">
                异常
              </span>
              <p className={cn(
                "text-[24px] font-mono font-semibold tabular-nums",
                totalFlagged > 0 ? 'text-health-warning' : 'text-health-normal',
              )}>
                {totalFlagged}
              </p>
            </div>
            <div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.06em] text-neutral-500">
                用药
              </span>
              <p className="text-[24px] font-mono font-semibold text-neutral-900 tabular-nums">
                {activeMeds.length}
              </p>
            </div>
          </div>
        </div>

        {/* Categories */}
        {categoryGroups.map((group) => (
          <div key={group.category} className="card mt-4 print:border-0 print:mt-6 print:break-inside-avoid">
            <div className="px-4 py-3 border-b border-neutral-200 print:px-0">
              <div className="flex items-center justify-between">
                <h3 className="text-[14px] font-display font-semibold text-neutral-900">
                  {getCategoryLabel(group.category)}
                </h3>
                <div className="flex items-center gap-2">
                  {group.flaggedCount > 0 && (
                    <StatusBadge status="warning" label={`${group.flaggedCount} 项异常`} />
                  )}
                  <span className="text-[10px] font-mono text-neutral-400">
                    {group.metrics.length} 项指标
                  </span>
                </div>
              </div>
            </div>

            {/* Table header */}
            <div className="grid grid-cols-[1fr_100px_120px_80px_64px] gap-2 px-4 py-2 border-b border-neutral-100 print:px-0">
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.06em] text-neutral-400">
                指标
              </span>
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.06em] text-neutral-400 text-right">
                结果
              </span>
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.06em] text-neutral-400 text-right">
                参考范围
              </span>
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.06em] text-neutral-400 text-center">
                状态
              </span>
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.06em] text-neutral-400 text-right print:hidden">
                趋势
              </span>
            </div>

            {/* Metric rows */}
            {group.metrics.map((metric) => {
              const refRange =
                metric.refLow != null && metric.refHigh != null
                  ? `${metric.refLow} – ${metric.refHigh}`
                  : metric.refLow != null
                    ? `> ${metric.refLow}`
                    : metric.refHigh != null
                      ? `< ${metric.refHigh}`
                      : '—';

              return (
                <div
                  key={metric.metricCode}
                  className="grid grid-cols-[1fr_100px_120px_80px_64px] gap-2 items-center px-4 py-2.5 border-b border-neutral-50 last:border-0 print:px-0"
                >
                  <div>
                    <span className="text-[12px] font-medium text-neutral-800 font-body">
                      {metric.metricName}
                    </span>
                    <span className="text-[10px] font-mono text-neutral-400 ml-2">
                      {formatDate(metric.observedAt)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[13px] font-mono font-semibold text-neutral-900 tabular-nums">
                      {formatObsValue(metric.metricCode, metric.latestValue, metric.valueText, metric.displayPrecision)}
                    </span>
                    {metric.unit && (
                      <span className="text-[10px] font-mono text-neutral-400 ml-1">
                        {metric.unit}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-mono text-neutral-500 text-right tabular-nums">
                    {refRange}
                  </span>
                  <div className="flex justify-center">
                    <StatusBadge status={metric.status} label={metric.status === 'normal' ? '正常' : metric.status === 'warning' ? '注意' : '异常'} />
                  </div>
                  <div className="flex justify-end print:hidden">
                    {metric.sparkData.length >= 2 && (
                      <MiniSparkline
                        data={metric.sparkData}
                        color={statusColor[metric.status] ?? statusColor.normal}
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

        {/* Medications section */}
        {activeMeds.length > 0 && (
          <div className="card mt-4 print:border-0 print:mt-6 print:break-inside-avoid">
            <div className="px-4 py-3 border-b border-neutral-200 print:px-0">
              <h3 className="text-[14px] font-display font-semibold text-neutral-900">
                当前用药
              </h3>
            </div>
            <div className="divide-y divide-neutral-50">
              {activeMeds.map((med) => (
                <div key={med.id} className="px-4 py-3 print:px-0 flex items-center justify-between">
                  <div>
                    <span className="text-[13px] font-medium text-neutral-800 font-body">
                      {med.name}
                    </span>
                    {med.genericName && (
                      <span className="text-[11px] text-neutral-400 font-body ml-2">
                        ({med.genericName})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    {med.dosage && (
                      <span className="text-[12px] font-mono text-neutral-600">
                        {med.dosage}
                      </span>
                    )}
                    {med.frequency && (
                      <span className="text-[11px] font-mono text-neutral-400">
                        {med.frequency}
                      </span>
                    )}
                    {med.startDate && (
                      <span className="text-[10px] font-mono text-neutral-400">
                        自 {formatDate(med.startDate)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Conditions section */}
        {condItems.filter((c) => c.status === 'active').length > 0 && (
          <div className="card mt-4 print:border-0 print:mt-6 print:break-inside-avoid">
            <div className="px-4 py-3 border-b border-neutral-200 print:px-0">
              <h3 className="text-[14px] font-display font-semibold text-neutral-900">
                当前诊断
              </h3>
            </div>
            <div className="divide-y divide-neutral-50">
              {condItems
                .filter((c) => c.status === 'active')
                .map((cond) => (
                  <div key={cond.id} className="px-4 py-3 print:px-0 flex items-center justify-between">
                    <div>
                      <span className="text-[13px] font-medium text-neutral-800 font-body">
                        {cond.name}
                      </span>
                      {cond.severity && (
                        <StatusBadge
                          status={cond.severity === 'severe' ? 'critical' : cond.severity === 'moderate' ? 'warning' : 'info'}
                          label={cond.severity === 'severe' ? '重度' : cond.severity === 'moderate' ? '中度' : '轻度'}
                          className="ml-2"
                        />
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-right">
                      {cond.diagnosedBy && (
                        <span className="text-[11px] font-mono text-neutral-400">
                          {cond.diagnosedBy}
                        </span>
                      )}
                      {cond.onsetDate && (
                        <span className="text-[10px] font-mono text-neutral-400">
                          自 {formatDate(cond.onsetDate)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Encounters section */}
        {encItems.length > 0 && (
          <div className="card mt-4 print:border-0 print:mt-6 print:break-inside-avoid">
            <div className="px-4 py-3 border-b border-neutral-200 print:px-0">
              <h3 className="text-[14px] font-display font-semibold text-neutral-900">
                近期就诊
              </h3>
            </div>
            <div className="divide-y divide-neutral-50">
              {encItems.slice(0, 10).map((enc) => (
                <div key={enc.id} className="px-4 py-3 print:px-0 flex items-center justify-between">
                  <div>
                    <span className="text-[13px] font-medium text-neutral-800 font-body capitalize">
                      {enc.type.replace(/_/g, ' ')}
                    </span>
                    {enc.chiefComplaint && (
                      <span className="text-[11px] text-neutral-400 font-body ml-2">
                        — {enc.chiefComplaint}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    {enc.provider && (
                      <span className="text-[11px] font-mono text-neutral-400">
                        {enc.provider}
                      </span>
                    )}
                    <span className="text-[10px] font-mono text-neutral-400">
                      {formatDate(enc.encounterDate)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommended retests */}
        {retestItems.filter((r) => r.urgency === 'overdue' || r.urgency === 'due_soon').length > 0 && (
          <div className="card mt-4 print:border-0 print:mt-6 print:break-inside-avoid">
            <div className="px-4 py-3 border-b border-neutral-200 print:px-0">
              <h3 className="text-[14px] font-display font-semibold text-neutral-900">
                建议复查
              </h3>
            </div>
            <div className="divide-y divide-neutral-50">
              {retestItems
                .filter((r) => r.urgency === 'overdue' || r.urgency === 'due_soon')
                .slice(0, 8)
                .map((r) => (
                  <div key={r.metricCode} className="px-4 py-3 print:px-0 flex items-center justify-between">
                    <div>
                      <span className="text-[13px] font-medium text-neutral-800 font-body">
                        {r.metricName}
                      </span>
                      <span className="text-[11px] text-neutral-400 font-mono ml-2">
                        {r.daysSinceLastTest} 天前检测
                      </span>
                    </div>
                    <StatusBadge
                      status={r.urgency === 'overdue' ? 'critical' : 'warning'}
                      label={r.urgency === 'overdue' ? '已逾期' : '即将到期'}
                    />
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 text-center print:mt-8">
          <p className="text-[10px] font-mono text-neutral-400">
            本报告由 HealthManager++ 生成，仅供参考，不构成医疗诊断依据，
            不能替代专业医疗建议、诊断或治疗，请遵医嘱。
          </p>
        </div>
      </div>
    </div>
  );
}
