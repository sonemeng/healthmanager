"use client";

import { Stethoscope, TestTubes, HeartPulse, Pill, CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fmtDay,
  posOf,
  type EventDetail,
  type LanePoint,
  type MedTrack,
  type Tick,
  type TimeWindow,
} from "./derive";

// ---------------------------------------------------------------------------
// 时间线 C（spec 18 §1）：四条泳道 —— 就诊 / 用药 / 病史 / 检查
// 就诊·病史·检查 = 点；用药 = 线段（分段历史）。点击点位/线段展开详情卡。
// ---------------------------------------------------------------------------

interface TimelineLanesProps {
  encounterPoints: LanePoint[];
  conditionPoints: LanePoint[];
  labPoints: LanePoint[];
  medTracks: MedTrack[];
  ticks: Tick[];
  win: TimeWindow;
  onSelect: (detail: EventDetail) => void;
}

/* ------------------------------- 刻度行 ------------------------------- */

function axisLabelStyle(p: number): string {
  if (p <= 0.02) return "translate-x-0";
  if (p >= 0.98) return "-translate-x-full";
  return "-translate-x-1/2";
}

function TrackGrid({ ticks, win }: { ticks: Tick[]; win: TimeWindow }) {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {ticks.map((tk) => (
        <span
          key={tk.t}
          className="absolute top-0 bottom-0 w-px bg-neutral-100"
          style={{ left: `${posOf(tk.t, win) * 100}%` }}
        />
      ))}
    </div>
  );
}

export function TimelineAxis({ ticks, win }: { ticks: Tick[]; win: TimeWindow }) {
  return (
    <div className="flex">
      <div className="w-20 shrink-0" />
      <div className="relative h-5 flex-1">
        {ticks.map((tk) => {
          const p = posOf(tk.t, win);
          return (
            <span
              key={tk.t}
              className={cn(
                "absolute top-0 whitespace-nowrap font-mono text-[10px] text-neutral-400",
                axisLabelStyle(p),
              )}
              style={{ left: `${p * 100}%` }}
            >
              {tk.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------- 点位 ------------------------------- */

function Marker({
  point,
  color,
  win,
  onSelect,
}: {
  point: LanePoint;
  color: string;
  win: TimeWindow;
  onSelect: (detail: EventDetail) => void;
}) {
  const c = point.abnormal ? "var(--color-health-warning)" : color;
  const size = point.abnormal ? 13 : 9;
  return (
    <button
      type="button"
      onClick={() => onSelect(point.detail)}
      title={`${fmtDay(point.t)} · ${point.label}`}
      className="group absolute top-1/2 -translate-x-1/2 -translate-y-1/2 p-2"
      style={{ left: `${posOf(point.t, win) * 100}%` }}
    >
      <span
        className="block rounded-full transition-transform group-hover:scale-125"
        style={{
          width: size,
          height: size,
          backgroundColor: point.hollow ? "var(--color-background, #fff)" : c,
          border: `2px solid ${c}`,
          boxShadow: point.abnormal
            ? "0 0 0 3px var(--color-health-warning-bg)"
            : undefined,
        }}
      />
    </button>
  );
}

function PointLane({
  label,
  color,
  icon: Icon,
  points,
  ticks,
  win,
  onSelect,
}: {
  label: string;
  color: string;
  icon: typeof Stethoscope;
  points: LanePoint[];
  ticks: Tick[];
  win: TimeWindow;
  onSelect: (detail: EventDetail) => void;
}) {
  return (
    <div className="flex items-center py-1">
      <div className="flex w-20 shrink-0 items-center justify-end gap-1.5 pr-3">
        <span className="text-[11px] font-medium text-neutral-500 font-body">
          {label}
        </span>
        <Icon className="size-3.5 shrink-0" style={{ color }} />
      </div>
      <div className="relative h-9 flex-1">
        <TrackGrid ticks={ticks} win={win} />
        {points.length === 0 ? (
          <span className="absolute top-1/2 -translate-y-1/2 pl-2 font-mono text-[10px] text-neutral-300">
            暂无记录
          </span>
        ) : (
          points.map((p) => (
            <Marker
              key={p.id}
              point={p}
              color={color}
              win={win}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}

/* ------------------------------- 用药线段 ------------------------------- */

function MedTrackRow({
  track,
  ticks,
  win,
  onSelect,
}: {
  track: MedTrack;
  ticks: Tick[];
  win: TimeWindow;
  onSelect: (detail: EventDetail) => void;
}) {
  const visible = track.segments.filter((s) => {
    const end = s.end ?? win.end;
    return end >= win.start && s.start <= win.end;
  });

  return (
    <div className="flex items-center py-1">
      <div className="w-20 shrink-0 pr-3 text-right">
        <span
          className="block truncate text-[11px] font-medium text-neutral-600 font-body"
          title={track.name}
        >
          {track.name}
        </span>
      </div>
      <div className="relative h-6 flex-1">
        <TrackGrid ticks={ticks} win={win} />
        {visible.map((s) => {
          const sp = posOf(s.start, win);
          const ep = s.end != null ? posOf(s.end, win) : 1;
          const left = Math.min(sp, ep);
          const width = Math.max(Math.abs(ep - sp), 0.012);
          const barColor = s.isActive
            ? "var(--color-accent-500)"
            : "var(--color-neutral-300)";
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.detail)}
              title={`${track.name} · ${s.detail.dateLabel}`}
              className="group absolute top-1/2 h-6 -translate-y-1/2"
              style={{ left: `${left * 100}%`, width: `${width * 100}%` }}
            >
              <span
                className="absolute top-1/2 block h-[7px] w-full -translate-y-1/2 rounded-full transition-all group-hover:h-[10px]"
                style={{ backgroundColor: barColor }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------- 主组件 ------------------------------- */

export function TimelineLanes({
  encounterPoints,
  conditionPoints,
  labPoints,
  medTracks,
  ticks,
  win,
  onSelect,
}: TimelineLanesProps) {
  const shownTracks = medTracks.slice(0, 12);
  const hiddenCount = medTracks.length - shownTracks.length;

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 px-4 py-3">
        <h2 className="text-[13px] font-semibold text-neutral-900 font-display">
          健康泳道
        </h2>
        <p className="text-[11px] font-mono text-neutral-400">
          点位 / 线段可点开详情
        </p>
      </div>

      <div className="px-2 pt-3 pb-2">
        <TimelineAxis ticks={ticks} win={win} />

        <div className="mt-1 divide-y divide-neutral-100">
          <PointLane
            label="就诊"
            color="var(--color-health-info)"
            icon={Stethoscope}
            points={encounterPoints}
            ticks={ticks}
            win={win}
            onSelect={onSelect}
          />

          <div className="flex items-center py-1">
            <div className="flex w-20 shrink-0 items-center justify-end gap-1.5 pr-3">
              <span className="text-[11px] font-medium text-neutral-500 font-body">
                用药
              </span>
              <Pill className="size-3.5 shrink-0" style={{ color: "#0d9488" }} />
            </div>
            <div className="flex-none pr-2 font-mono text-[10px] text-neutral-300">
              {medTracks.length > 0 ? `${medTracks.length} 种` : ""}
            </div>
          </div>
          {shownTracks.length === 0 ? (
            <div className="flex items-center py-2 pl-20 font-mono text-[10px] text-neutral-300">
              暂无用药记录
            </div>
          ) : (
            shownTracks.map((t) => (
              <MedTrackRow
                key={t.name}
                track={t}
                ticks={ticks}
                win={win}
                onSelect={onSelect}
              />
            ))
          )}
          {hiddenCount > 0 && (
            <div className="py-1.5 pl-20 font-mono text-[10px] text-neutral-400">
              另有 {hiddenCount} 种用药未显示
            </div>
          )}

          <PointLane
            label="病史"
            color="var(--color-health-warning)"
            icon={HeartPulse}
            points={conditionPoints}
            ticks={ticks}
            win={win}
            onSelect={onSelect}
          />
          <PointLane
            label="检查"
            color="var(--color-accent-500)"
            icon={TestTubes}
            points={labPoints}
            ticks={ticks}
            win={win}
            onSelect={onSelect}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-neutral-100 px-4 py-2">
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-neutral-400">
          <span
            className="inline-block size-2.5 rounded-full"
            style={{ backgroundColor: "var(--color-accent-500)" }}
          />
          检查
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-neutral-400">
          <span
            className="inline-block size-2.5 rounded-full"
            style={{ backgroundColor: "var(--color-health-info)" }}
          />
          就诊
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-neutral-400">
          <span
            className="inline-block h-[7px] w-4 rounded-full"
            style={{ backgroundColor: "var(--color-neutral-300)" }}
          />
          用药区间
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-neutral-400">
          <span
            className="inline-block size-3 rounded-full"
            style={{
              backgroundColor: "var(--color-health-warning)",
              boxShadow: "0 0 0 2px var(--color-health-warning-bg)",
            }}
          />
          异常
        </span>
        <span className="flex items-center gap-1 font-mono text-[10px] text-neutral-400">
          <CircleAlert className="size-3" />
          点位稀少时可先切换「按年」查看全局
        </span>
      </div>
    </div>
  );
}
