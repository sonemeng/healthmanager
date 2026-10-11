"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { TitleActionHeader } from "@/components/title-action-header";
import { StatusBadge } from "@/components/health/status-badge";
import { AnimatedEmptyState } from "@/components/animated-empty-state";
import { PillTabs } from "@/components/pill-tabs";
import { useModal } from "@/components/modal/provider";
import { cn } from "@/lib/utils";
import {
  Clock,
  TestTubes,
  Pill,
  HeartPulse,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";
import { TimelineLanes } from "@/components/timeline/timeline-lanes";
import { WatchCurves } from "@/components/timeline/watch-curves";
import { FacetGrid } from "@/components/timeline/facet-grid";
import {
  EventDetailCard,
  MetricTrendCard,
} from "@/components/timeline/event-detail";
import {
  computeDomain,
  deriveConditionPoints,
  deriveEncounterPoints,
  deriveLabPoints,
  deriveListEvents,
  deriveMedTracks,
  deriveSeries,
  fmtDay,
  fmtMonth,
  groupObservationsByDay,
  makeTicks,
  type EventDetail,
  type Granularity,
  type MetricSeries,
  type RawObs,
} from "@/components/timeline/derive";

// ---------------------------------------------------------------------------
// 时间线 C（spec 18 §1/§2，0.1.13）：LifeLines 泳道式时间线
// 泳道（就诊/用药/病史/检查）+ 关注指标曲线（共用时间轴）+ 分面小图矩阵
// 原「按月列表」降级为页内「列表」视图，信息不丢。
// ---------------------------------------------------------------------------

const emptyIcons = [Clock, TestTubes, Pill, HeartPulse, Stethoscope];

const LIST_ICONS: Record<string, LucideIcon> = {
  lab: TestTubes,
  encounter: Stethoscope,
  condition: HeartPulse,
  medication: Pill,
};

const LIST_ICON_COLORS: Record<string, string> = {
  lab: "text-accent-600",
  encounter: "text-[var(--color-health-info)]",
  condition: "text-[var(--color-health-warning)]",
  medication: "text-teal-600",
};

export default function TimelinePage() {
  const modal = useModal();

  const observations = trpc.observations.list.useQuery({ limit: 200 });
  const medications = trpc.medications.list.useQuery({});
  const conditions = trpc.conditions.list.useQuery();
  const encounters = trpc.encounters.list.useQuery();
  const dash = trpc.dashboardMetrics.list.useQuery();
  const metrics = trpc.metrics.list.useQuery();

  const [view, setView] = useState<"lanes" | "list">("lanes");
  const [granularity, setGranularity] = useState<Granularity>("year");
  const [selected, setSelected] = useState<string[] | null>(null);
  const [customWin, setCustomWin] = useState<{ start: number; end: number } | null>(
    null,
  );

  const isLoading =
    observations.isLoading ||
    medications.isLoading ||
    conditions.isLoading ||
    encounters.isLoading;

  /* ----------------------------- 名称字典 ----------------------------- */

  const nameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of metrics.data ?? []) m.set(d.id, d.name);
    return m;
  }, [metrics.data]);

  const obs = useMemo<RawObs[]>(
    () => (observations.data?.items ?? []) as unknown as RawObs[],
    [observations.data],
  );

  /* ------------------------------ 泳道数据 ------------------------------ */

  const labBatches = useMemo(() => groupObservationsByDay(obs), [obs]);
  const labPoints = useMemo(
    () => deriveLabPoints(labBatches, (c) => nameMap.get(c) ?? c),
    [labBatches, nameMap],
  );
  const encounterPoints = useMemo(
    () => deriveEncounterPoints(encounters.data ?? []),
    [encounters.data],
  );
  const conditionPoints = useMemo(
    () => deriveConditionPoints(conditions.data ?? []),
    [conditions.data],
  );
  const medTracks = useMemo(
    () => deriveMedTracks(medications.data?.items ?? []),
    [medications.data],
  );

  /* ---------------------------- 关注指标序列 ---------------------------- */

  const latestByCode = useMemo(() => {
    const m = new Map<string, RawObs>();
    for (const r of obs) if (!m.has(r.metricCode)) m.set(r.metricCode, r);
    return m;
  }, [obs]);

  const available = useMemo(() => {
    const saved = dash.data?.saved ?? [];
    return saved.map((s) => ({
      code: s.metricCode,
      name: nameMap.get(s.metricCode) ?? s.metricCode,
    }));
  }, [dash.data, nameMap]);

  const allSeries = useMemo<MetricSeries[]>(
    () =>
      available.map((a) =>
        deriveSeries(a.code, a.name, obs, latestByCode.get(a.code)),
      ),
    [available, obs, latestByCode],
  );

  const activeCodes = selected ?? available.slice(0, 2).map((a) => a.code);
  const activeSeries = useMemo(
    () =>
      activeCodes
        .map((c) => allSeries.find((s) => s.code === c))
        .filter((s): s is MetricSeries => s != null),
    [activeCodes, allSeries],
  );

  /* ------------------------------ 时间轴 ------------------------------ */

  const domain = useMemo(
    () =>
      computeDomain([
        ...labPoints.map((p) => p.t),
        ...encounterPoints.map((p) => p.t),
        ...conditionPoints.map((p) => p.t),
        ...medTracks.flatMap((t) =>
          t.segments.flatMap((s) => (s.end != null ? [s.start, s.end] : [s.start])),
        ),
        ...allSeries.flatMap((s) => s.points.map((p) => p.t)),
      ]),
    [labPoints, encounterPoints, conditionPoints, medTracks, allSeries],
  );

  const win = useMemo(() => {
    if (!customWin) return domain;
    const start = Math.max(domain.start, customWin.start);
    const end = Math.min(domain.end, customWin.end);
    if (!(end > start)) return domain;
    return { start, end };
  }, [customWin, domain]);

  const ticks = useMemo(() => makeTicks(win, granularity), [win, granularity]);

  /* ------------------------------ 列表数据 ------------------------------ */

  const listEvents = useMemo(
    () => deriveListEvents(labPoints, encounterPoints, conditionPoints, medTracks),
    [labPoints, encounterPoints, conditionPoints, medTracks],
  );

  const groupedList = useMemo(() => {
    const m = new Map<string, typeof listEvents>();
    for (const e of listEvents) {
      const k = fmtMonth(e.t);
      const arr = m.get(k) ?? [];
      arr.push(e);
      m.set(k, arr);
    }
    return Array.from(m.entries());
  }, [listEvents]);

  /* ------------------------------- 交互 ------------------------------- */

  const openDetail = (d: EventDetail) => modal.show(<EventDetailCard detail={d} />);
  const openSeries = (s: MetricSeries) =>
    modal.show(<MetricTrendCard series={s} />);

  const handleSelectedChange = (codes: string[]) => {
    setSelected(codes);
    setCustomWin(null);
  };

  // 幂等：同一区间不触发新对象，避免 Brush onChange 与 domain 更新互相激发
  const handleWindowChange = (w: { start: number; end: number }) => {
    setCustomWin((prev) => {
      if (prev && prev.start === w.start && prev.end === w.end) return prev;
      return w;
    });
  };

  /* ------------------------------ 渲染 ------------------------------ */

  if (isLoading) {
    return (
      <div>
        <TitleActionHeader title="时间线" subtitle="加载中…" />
        <div className="mt-7 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card h-24 animate-pulse bg-neutral-50" />
          ))}
        </div>
      </div>
    );
  }

  if (listEvents.length === 0) {
    return (
      <div>
        <TitleActionHeader
          title="时间线"
          subtitle="按时间轴汇总你的检验、用药、病史与就诊记录。"
        />
        <div className="mt-7">
          <AnimatedEmptyState
            title="暂无健康记录"
            description="上传一份检验报告、添加一条用药或病史，即可在这里生成时间线。"
            cardIcon={({ index }) => emptyIcons[index % emptyIcons.length]!}
            learnMoreHref="/uploads"
            learnMoreClassName="border-accent-200 text-accent-600 hover:bg-accent-50"
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <TitleActionHeader
        title="时间线"
        subtitle={`共 ${listEvents.length} 条记录 · ${labPoints.length} 次检查`}
        actions={
          <PillTabs
            items={[
              { id: "lanes", label: "泳道" },
              { id: "list", label: "列表" },
            ]}
            value={view}
            onChange={(v) => setView(v)}
          />
        }
      />

      {view === "lanes" ? (
        <div className="mt-6 space-y-4">
          <WatchCurves
            series={activeSeries}
            available={available}
            selected={activeCodes}
            onSelectedChange={handleSelectedChange}
            win={win}
            onWindowChange={handleWindowChange}
            granularity={granularity}
            onGranularityChange={setGranularity}
            ticks={ticks}
          />

          <TimelineLanes
            encounterPoints={encounterPoints}
            conditionPoints={conditionPoints}
            labPoints={labPoints}
            medTracks={medTracks}
            ticks={ticks}
            win={win}
            onSelect={openDetail}
          />

          {available.length > 0 && (
            <FacetGrid
              items={allSeries}
              win={win}
              ticks={ticks}
              onExpand={openSeries}
            />
          )}
        </div>
      ) : (
        <div className="mt-6">
          {groupedList.map(([month, monthEvents]) => (
            <div key={month} className="mb-6">
              <div className="mb-3 flex items-center gap-3">
                <span className="font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-neutral-400">
                  {month}
                </span>
                <div className="h-px flex-1 bg-neutral-200" />
                <span className="font-mono text-[10px] tabular-nums text-neutral-400">
                  {monthEvents.length}
                </span>
              </div>

              <div className="relative">
                <div className="absolute bottom-4 left-[15px] top-4 w-px bg-neutral-200" />
                <div className="space-y-0">
                  {monthEvents.map((item) => {
                    const Icon = LIST_ICONS[item.kind] ?? Clock;
                    return (
                      <div key={item.id} className="relative flex gap-4 pb-4 last:pb-0">
                        <span
                          className={cn(
                            "relative z-10 flex size-[31px] shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white",
                          )}
                        >
                          <Icon
                            className={cn("size-4", LIST_ICON_COLORS[item.kind])}
                          />
                        </span>

                        <button
                          type="button"
                          onClick={() => openDetail(item.detail)}
                          className="card flex-1 p-4 text-left transition-colors hover:border-accent-300"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-[14px] font-semibold text-neutral-900 font-body">
                                {item.title}
                              </p>
                              {item.subtitle && (
                                <p className="mt-1 truncate text-[12px] text-neutral-500 font-body">
                                  {item.subtitle}
                                </p>
                              )}
                            </div>
                            <StatusBadge
                              status={item.status}
                              label={item.badgeLabel}
                            />
                          </div>
                          <div className="mt-2 flex items-center gap-3">
                            <span className="font-mono text-[11px] text-neutral-400">
                              {fmtDay(item.t)}
                            </span>
                            <span className="font-mono text-[10px] text-neutral-300">
                              点击查看详情
                            </span>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
