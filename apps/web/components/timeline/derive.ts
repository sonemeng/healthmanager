import type { HealthStatus } from "@/components/health/status-badge";

// ---------------------------------------------------------------------------
// 时间线 C（spec 18 §1）：数据派生与时间轴工具（纯函数，无副作用）
// ---------------------------------------------------------------------------

export type Granularity = "year" | "month";

export const DAY_MS = 86_400_000;

/* ----------------------------- 日期工具 ----------------------------- */

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 解析各种日期表示 → 本地零点 ms（时间线只按天定位，规避时区漂移） */
export function toDayMs(d: string | number | Date | null | undefined): number | null {
  if (d == null) return null;
  if (typeof d === "number") return Number.isFinite(d) ? d : null;
  if (d instanceof Date) {
    const t = d.getTime();
    return Number.isFinite(t) ? t : null;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  }
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? t : null;
}

export function fmtDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function fmtMonth(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

export function fmtYearMonth(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

/* ------------------------------- 类型 ------------------------------- */

export interface EventRow {
  label: string;
  value: string;
}

export interface EventDetail {
  title: string;
  dateLabel: string;
  badge?: { status: HealthStatus; label: string };
  rows: EventRow[];
  note?: string;
  href?: string;
  hrefLabel?: string;
  aiQuestion?: string;
}

export type PointLane = "labs" | "encounters" | "conditions";

export interface LanePoint {
  id: string;
  lane: PointLane;
  t: number;
  /** 短标签（点位 title / 详情卡标题兜底） */
  label: string;
  status: HealthStatus;
  abnormal: boolean;
  /** 空心点（如「已痊愈」） */
  hollow?: boolean;
  detail: EventDetail;
}

export interface MedSegment {
  id: string;
  start: number;
  end: number | null;
  isActive: boolean;
  detail: EventDetail;
}

export interface MedTrack {
  name: string;
  segments: MedSegment[];
}

export interface SeriesPoint {
  t: number;
  v: number;
  abnormal: boolean;
}

export interface MetricSeries {
  code: string;
  name: string;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  status: HealthStatus;
  points: SeriesPoint[];
}

export interface ListEvent {
  id: string;
  t: number;
  kind: "lab" | "encounter" | "condition" | "medication";
  title: string;
  subtitle: string;
  status: HealthStatus;
  badgeLabel: string;
  detail: EventDetail;
}

/* --------------------------- 原始行（结构类型） --------------------------- */

export interface RawObs {
  id: string;
  metricCode: string;
  valueNumeric: number | null;
  valueText: string | null;
  unit: string | null;
  isAbnormal: boolean | null;
  referenceRangeLow: number | null;
  referenceRangeHigh: number | null;
  observedAt: string | Date;
  importJobId: string | null;
}

export interface RawMed {
  id: string;
  name: string;
  dosage?: string | null;
  frequency?: string | null;
  route?: string | null;
  prescriber?: string | null;
  indication?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isActive?: boolean | null;
  notes?: string | null;
}

export interface RawCond {
  id: string;
  name: string;
  severity?: string | null;
  status?: string | null;
  onsetDate?: string | null;
  resolutionDate?: string | null;
  diagnosedBy?: string | null;
  notes?: string | null;
  importJobId?: string | null;
}

export interface RawEnc {
  id: string;
  type: string;
  encounterDate: string | Date;
  provider?: string | null;
  facility?: string | null;
  chiefComplaint?: string | null;
  summary?: string | null;
  importJobId?: string | null;
}

/* ------------------------------- 文案表 ------------------------------- */

const SEVERITY_RANK: Record<string, number> = {
  critical: 4,
  warning: 3,
  info: 2,
  normal: 1,
  neutral: 0,
};

export function higherStatus(a: HealthStatus, b: HealthStatus): HealthStatus {
  return (SEVERITY_RANK[b] ?? 0) > (SEVERITY_RANK[a] ?? 0) ? b : a;
}

export const ENCOUNTER_TYPE_LABELS: Record<string, string> = {
  checkup: "体检",
  specialist: "专科门诊",
  urgent_care: "紧急门诊",
  emergency: "急诊",
  telehealth: "线上问诊",
  lab_visit: "化验检查",
  imaging: "影像检查",
  dental: "牙科",
  therapy: "康复治疗",
  other: "其他就诊",
};

export function encounterLabel(type: string): string {
  return ENCOUNTER_TYPE_LABELS[type] ?? "其他就诊";
}

const SEVERITY_LABELS: Record<string, string> = {
  mild: "轻度",
  moderate: "中度",
  severe: "重度",
};

/* ------------------------------ 检验批次 ------------------------------ */

export interface LabBatchRaw {
  day: number;
  rows: RawObs[];
}

/** 同一天 = 一次检查（与 compareBatches 同口径） */
export function groupObservationsByDay(rows: RawObs[]): LabBatchRaw[] {
  const byDay = new Map<number, RawObs[]>();
  for (const r of rows) {
    const t = toDayMs(r.observedAt);
    if (t == null) continue;
    const list = byDay.get(t) ?? [];
    list.push(r);
    byDay.set(t, list);
  }
  return Array.from(byDay.entries())
    .map(([day, list]) => ({ day, rows: list }))
    .sort((a, b) => a.day - b.day);
}

export function deriveLabPoints(
  batches: LabBatchRaw[],
  nameOf: (code: string) => string,
): LanePoint[] {
  return batches.map((batch) => {
    const abnormalRows = batch.rows.filter((r) => r.isAbnormal === true);
    const abnormalCount = abnormalRows.length;
    const uniqueCodes = Array.from(new Set(batch.rows.map((r) => r.metricCode)));
    const preview = uniqueCodes
      .slice(0, 4)
      .map((c) => nameOf(c))
      .join("、");
    const fromImport = batch.rows.some((r) => r.importJobId != null);

    let status: HealthStatus = "normal";
    if (abnormalCount > 0) {
      status = "warning";
      for (const r of abnormalRows) {
        const span =
          r.referenceRangeHigh != null && r.referenceRangeLow != null
            ? r.referenceRangeHigh - r.referenceRangeLow
            : 0;
        const far = r.valueNumeric != null && span > 0 &&
          ((r.referenceRangeLow != null && r.referenceRangeLow - r.valueNumeric > span * 0.5) ||
            (r.referenceRangeHigh != null && r.valueNumeric - r.referenceRangeHigh > span * 0.5));
        if (far) {
          status = "critical";
          break;
        }
      }
    }

    const dateLabel = fmtDay(batch.day);
    return {
      id: `lab-${dateLabel}`,
      lane: "labs" as const,
      t: batch.day,
      label: `检查 ${abnormalCount > 0 ? `${abnormalCount} 项异常` : "全部正常"}`,
      status,
      abnormal: abnormalCount > 0,
      detail: {
        title: "检验批次",
        dateLabel,
        badge: {
          status,
          label: abnormalCount > 0 ? `${abnormalCount} 项异常` : "全部正常",
        },
        rows: [
          { label: "检查指标", value: `${uniqueCodes.length} 项` },
          { label: "异常项", value: abnormalCount > 0 ? `${abnormalCount} 项` : "无" },
          { label: "指标预览", value: preview || "—" },
          { label: "来源", value: fromImport ? "导入报告" : "手动录入" },
        ],
        note:
          abnormalCount > 0
            ? "异常项已在检验结果中高亮，可进入批次对比查看逐项变化。"
            : undefined,
        href: "/compare",
        hrefLabel: "进入批次对比",
        aiQuestion: `请基于 ${dateLabel} 这次检验（共 ${uniqueCodes.length} 项，${abnormalCount} 项异常）解读结果，并说明需要向医生确认的事项。`,
      },
    };
  });
}

/* ------------------------------- 就诊 ------------------------------- */

export function deriveEncounterPoints(encounters: RawEnc[]): LanePoint[] {
  const out: LanePoint[] = [];
  for (const e of encounters) {
    const t = toDayMs(e.encounterDate);
    if (t == null) continue;
    const typeLabel = encounterLabel(e.type);
    const dateLabel = fmtDay(t);
    const rows: EventRow[] = [{ label: "类型", value: typeLabel }];
    if (e.provider) rows.push({ label: "医生", value: e.provider });
    if (e.facility) rows.push({ label: "机构", value: e.facility });
    if (e.chiefComplaint) rows.push({ label: "主诉", value: e.chiefComplaint });
    out.push({
      id: `enc-${e.id}`,
      lane: "encounters",
      t,
      label: typeLabel,
      status: "info",
      abnormal: false,
      detail: {
        title: typeLabel,
        dateLabel,
        badge: { status: "info", label: typeLabel },
        rows,
        note: e.summary ?? undefined,
        href: "/encounters",
        hrefLabel: "查看就诊记录",
        aiQuestion: `请解读 ${dateLabel} 的这次就诊（${typeLabel}${e.chiefComplaint ? `，主诉：${e.chiefComplaint}` : ""}），并说明需要向医生确认的事项。`,
      },
    });
  }
  return out;
}

/* ------------------------------- 病史 ------------------------------- */

export function deriveConditionPoints(conditions: RawCond[]): LanePoint[] {
  const out: LanePoint[] = [];
  for (const c of conditions) {
    const onset = toDayMs(c.onsetDate ?? null);
    if (onset != null) {
      const sev = c.severity ?? null;
      const status: HealthStatus =
        sev === "severe" ? "critical" : sev === "moderate" ? "warning" : "info";
      const rows: EventRow[] = [];
      if (sev) rows.push({ label: "严重度", value: SEVERITY_LABELS[sev] ?? sev });
      if (c.diagnosedBy) rows.push({ label: "诊断方", value: c.diagnosedBy });
      rows.push({ label: "状态", value: c.status === "resolved" ? "已痊愈" : "进行中" });
      out.push({
        id: `cond-onset-${c.id}`,
        lane: "conditions",
        t: onset,
        label: c.name,
        status,
        abnormal: status === "critical" || status === "warning",
        detail: {
          title: `确诊：${c.name}`,
          dateLabel: fmtDay(onset),
          badge: {
            status,
            label: sev ? (SEVERITY_LABELS[sev] ?? sev) : "确诊",
          },
          rows,
          note: c.notes ?? undefined,
          href: "/conditions",
          hrefLabel: "查看病史记录",
          aiQuestion: `请说明「${c.name}」${sev ? `（${SEVERITY_LABELS[sev] ?? sev}）` : ""}的日常注意事项与复查建议，并列出需要向医生确认的问题。`,
        },
      });
    }

    const resolved = toDayMs(c.resolutionDate ?? null);
    if (c.status === "resolved" && resolved != null) {
      out.push({
        id: `cond-resolved-${c.id}`,
        lane: "conditions",
        t: resolved,
        label: `${c.name}（已痊愈）`,
        status: "normal",
        abnormal: false,
        hollow: true,
        detail: {
          title: `痊愈：${c.name}`,
          dateLabel: fmtDay(resolved),
          badge: { status: "normal", label: "已痊愈" },
          rows: [{ label: "状态", value: "已痊愈" }],
          note: c.notes ?? undefined,
          href: "/conditions",
          hrefLabel: "查看病史记录",
        },
      });
    }
  }
  return out;
}

/* ------------------------------- 用药 ------------------------------- */

export function deriveMedTracks(meds: RawMed[]): MedTrack[] {
  const byName = new Map<string, MedSegment[]>();
  for (const m of meds) {
    const start = toDayMs(m.startDate ?? null);
    const end = toDayMs(m.endDate ?? null);
    const anchor = start ?? end;
    if (anchor == null) continue;
    const isActive = m.isActive !== false && end == null;
    const rows: EventRow[] = [];
    if (m.dosage) rows.push({ label: "剂量", value: m.dosage });
    if (m.frequency) rows.push({ label: "频次", value: m.frequency });
    if (m.route) rows.push({ label: "途径", value: m.route });
    if (m.indication) rows.push({ label: "适应证", value: m.indication });
    if (m.prescriber) rows.push({ label: "开方医生", value: m.prescriber });
    rows.push({
      label: "用药区间",
      value: `${fmtDay(start ?? anchor)} ~ ${end != null ? fmtDay(end) : "至今"}`,
    });
    rows.push({ label: "状态", value: isActive ? "在用" : "已停用" });

    const seg: MedSegment = {
      id: `med-${m.id}`,
      start: start ?? anchor,
      end: end,
      isActive,
      detail: {
        title: m.name,
        dateLabel: `${fmtDay(start ?? anchor)} ~ ${end != null ? fmtDay(end) : "至今"}`,
        badge: { status: isActive ? "info" : "neutral", label: isActive ? "在用" : "已停用" },
        rows,
        note: m.notes ?? undefined,
        href: "/medications",
        hrefLabel: "查看用药记录",
        aiQuestion: `请说明「${m.name}」${m.dosage ? `（${m.dosage}${m.frequency ? `，${m.frequency}` : ""}）` : ""}的作用、常见注意事项与需要向医生确认的问题。`,
      },
    };

    const list = byName.get(m.name) ?? [];
    list.push(seg);
    byName.set(m.name, list);
  }

  return Array.from(byName.entries())
    .map(([name, segments]) => ({
      name,
      segments: segments.sort((a, b) => a.start - b.start),
    }))
    .sort((a, b) => {
      const aLast = a.segments[a.segments.length - 1];
      const bLast = b.segments[b.segments.length - 1];
      const aT = aLast?.end ?? Number.POSITIVE_INFINITY;
      const bT = bLast?.end ?? Number.POSITIVE_INFINITY;
      if (aT !== bT) return bT - aT;
      return a.name.localeCompare(b.name, "zh");
    });
}

/* ---------------------------- 关注指标序列 ---------------------------- */

export function deriveSeries(
  code: string,
  name: string,
  obs: RawObs[],
  latest: RawObs | undefined,
): MetricSeries {
  const points: SeriesPoint[] = obs
    .filter((r) => r.metricCode === code && r.valueNumeric != null)
    .map((r) => ({
      t: toDayMs(r.observedAt) ?? 0,
      v: r.valueNumeric as number,
      abnormal: r.isAbnormal === true,
    }))
    .sort((a, b) => a.t - b.t);

  const last = points[points.length - 1];
  const status: HealthStatus = last?.abnormal ? "warning" : "normal";

  return {
    code,
    name,
    unit: latest?.unit ?? null,
    refLow: latest?.referenceRangeLow ?? null,
    refHigh: latest?.referenceRangeHigh ?? null,
    status,
    points,
  };
}

export interface ValueAxis {
  /** [下界, 上界]，均为 step 的整数倍 */
  domain: [number, number];
  /** 一格的高度（1/2/5×10^n） */
  step: number;
  /** 显式刻度值（含两端），相邻间距恒为 step */
  ticks: number[];
}

/**
 * 纵轴自适应区间：把数据范围外扩到 1/2/5×10^n 整刻度，**数据顶点上方固定留一整格**。
 *
 * 算法四步：
 * 1. 目标段数 tickCount → 原始步长 raw = 跨度 / tickCount；
 * 2. 把 raw 归到 1/2/5×10^n 的「整刻度」，得到 step；
 * 3. 下界 floor(a/step)、上界 ceil(b/step) + step；
 * 4. 下界余量不足半格再让一格（非负指标锁 0，不画负数）。
 *
 * 为什么上界一律多一格（2026-10-18 用户第二次修正）：
 * - 只 floor/ceil 时极值可正好落在刻度线上，余量为 0（mpv 11.8~11.9、尿肌酐 98.1%）；
 * - 「不足半格才补一格」仍不够：实测 75 个指标里 16 个顶点距上沿不足半个屏幕刻度，
 *   最差 alt 只有 11px，点半径 4.5px，看着就是被切掉；
 * - 用户口径：「最大值大于半个刻度就向上多一个刻度，或者直接多一个刻度」。
 *   一律多一格后，顶点距上沿中位 33 → 41px，不足半刻度的 16 → 7 个，最差 11 → 20px。
 *
 * 另外必须把 ticks 显式算出来：算法里的 step 与 recharts 默认 5 等分（4 段）不是一回事，
 * 不显式给刻度，用户看到的「半格」其实是 0.8 个 step，留白永远显得不够。
 */
export function niceValueAxis(
  lo: number,
  hi: number,
  tickCount = 8,
): ValueAxis {
  const round = (v: number) => Number(v.toFixed(10));
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    return { domain: [0, 1], step: 0.25, ticks: [0, 0.25, 0.5, 0.75, 1] };
  }
  let a = Math.min(lo, hi);
  let b = Math.max(lo, hi);
  if (b - a < 1e-12) {
    const d = Math.abs(b) > 1e-12 ? Math.abs(b) * 0.1 : 1;
    a -= d;
    b += d;
  }
  const raw = (b - a) / Math.max(1, tickCount);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  let lower = Math.floor(a / step) * step;
  // 顶点上方固定一整格：ceil 后再加一格，余量落在 [1, 2) 格，绝不可能贴边
  const upper = Math.ceil(b / step) * step + step;
  if (a - lower < step * 0.5) lower -= step;
  // 非负指标不往下画到负数（白细胞 0~3.92 若留白会得到 -0.5，没有意义）
  if (a >= 0 && lower < 0) lower = 0;

  const segs = Math.round((upper - lower) / step);
  const ticks: number[] = [];
  // 段数过多时不硬塞刻度（标签会叠），交给 recharts 自己均分
  if (segs > 0 && segs <= 14) {
    for (let i = 0; i <= segs; i += 1) ticks.push(round(lower + i * step));
  }
  return { domain: [round(lower), round(upper)], step: round(step), ticks };
}

export function niceValueDomain(
  lo: number,
  hi: number,
  tickCount = 8,
): [number, number] {
  return niceValueAxis(lo, hi, tickCount).domain;
}

/**
 * 单条序列的纵轴区间：**只看实测数值**，参考区间不参与。
 *
 * 演进记录（都踩过）：
 * - recharts 默认 `[0, 'auto']`（axisSelectors.js:147）：空腹血糖 6.4~7.21 被 nicetick
 *   成 0~8，两点落在绘图区 80%/90% 高度，整条曲线只剩顶部 18px。
 * - 把参考区间整体并入：血小板实测 103~106、参考 125~350，轴变 100~400，
 *   曲线只剩 1.8px，比默认还糟。
 * - 「只就近吸收参考边界」：多数指标没差别，但数据远离参考区间时仍会把轴撑大。
 * 用户 2026-10-18 定调：**分辨率优先，色带压缩/被裁都无所谓**。
 * 因此这里彻底不引入参考区间；色带超出纵轴会被裁切，参考区间数值改由图例文字给出，
 * 信息不丢。数据点永远落在轴内，不存在「为了色带把点画丢」的可能。
 *
 * 另外，极值必须离轴边界留出一整格（见 niceValueAxis）：只 floor/ceil 时，
 * 数据顶点会正好压在轴线上，点被画在图边像「显示不全」。
 */
export function seriesValueDomain(s: MetricSeries): [number, number] {
  const vals = s.points.map((p) => p.v).filter((v) => Number.isFinite(v));
  if (vals.length === 0) return [0, 1];
  return niceValueDomain(Math.min(...vals), Math.max(...vals));
}

/** 同 seriesValueDomain，但连刻度一起给出，供 YAxis 显式指定 ticks */
export function seriesValueAxis(s: MetricSeries): ValueAxis {
  const vals = s.points.map((p) => p.v).filter((v) => Number.isFinite(v));
  if (vals.length === 0) return niceValueAxis(0, 1);
  return niceValueAxis(Math.min(...vals), Math.max(...vals));
}

/* ------------------------------ 列表视图 ------------------------------ */

export function deriveListEvents(
  labPoints: LanePoint[],
  encounterPoints: LanePoint[],
  conditionPoints: LanePoint[],
  medTracks: MedTrack[],
): ListEvent[] {
  const out: ListEvent[] = [];

  for (const p of labPoints) {
    out.push({
      id: p.id,
      t: p.t,
      kind: "lab",
      title: "检验批次",
      subtitle: p.detail.rows.map((r) => `${r.label} ${r.value}`).join(" · "),
      status: p.status,
      badgeLabel: p.detail.badge?.label ?? "记录",
      detail: p.detail,
    });
  }
  for (const p of encounterPoints) {
    out.push({
      id: p.id,
      t: p.t,
      kind: "encounter",
      title: p.label,
      subtitle: p.detail.rows.map((r) => `${r.label} ${r.value}`).join(" · "),
      status: p.status,
      badgeLabel: p.detail.badge?.label ?? "就诊",
      detail: p.detail,
    });
  }
  for (const p of conditionPoints) {
    out.push({
      id: p.id,
      t: p.t,
      kind: "condition",
      title: p.detail.title,
      subtitle: p.detail.rows.map((r) => `${r.label} ${r.value}`).join(" · "),
      status: p.status,
      badgeLabel: p.detail.badge?.label ?? "病史",
      detail: p.detail,
    });
  }
  for (const track of medTracks) {
    for (const seg of track.segments) {
      out.push({
        id: `${seg.id}-start`,
        t: seg.start,
        kind: "medication",
        title: `开始用药：${track.name}`,
        subtitle: seg.detail.rows.map((r) => `${r.label} ${r.value}`).join(" · "),
        status: "info",
        badgeLabel: "开始",
        detail: seg.detail,
      });
      if (seg.end != null && !seg.isActive) {
        out.push({
          id: `${seg.id}-end`,
          t: seg.end,
          kind: "medication",
          title: `停用：${track.name}`,
          subtitle: `${fmtDay(seg.start)} ~ ${fmtDay(seg.end)}`,
          status: "neutral",
          badgeLabel: "结束",
          detail: seg.detail,
        });
      }
    }
  }

  return out.sort((a, b) => b.t - a.t);
}

/* ------------------------------ 时间轴工具 ------------------------------ */

export interface TimeWindow {
  start: number;
  end: number;
}

export function computeDomain(values: number[]): TimeWindow {
  if (values.length === 0) {
    const now = Date.now();
    return { start: now - 90 * DAY_MS, end: now };
  }
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === max) {
    min -= 15 * DAY_MS;
    max += 15 * DAY_MS;
  }
  const pad = (max - min) * 0.03;
  return { start: min - pad, end: max + pad };
}

/* -------------------------- 时间窗口的缩放与平移 -------------------------- */

/**
 * 把窗口夹回 domain 内，并保证跨度不低于下限。
 *
 * `dSpan / 500` 这层是为了极长病史：只按一天做下限时，几年的时间轴仍能缩到
 * 一天，刻度会挤成一团；按总跨度的 1/500 收口，任何数据量下刻度都不会爆。
 */
function clampWindow(w: TimeWindow, domain: TimeWindow, minSpan: number): TimeWindow {
  const dSpan = Math.max(1, domain.end - domain.start);
  const floor = Math.min(Math.max(minSpan, dSpan / 500), dSpan);
  const span = Math.min(Math.max(w.end - w.start, floor), dSpan);
  let start = w.start;
  if (start < domain.start) start = domain.start;
  if (start + span > domain.end) start = domain.end - span;
  return { start, end: start + span };
}

/**
 * 缩放时间窗口。
 *
 * @param anchorRatio 锚点在当前窗口中的位置（0=左端，1=右端），通常取鼠标 x 的比例。
 *   锚点处的时间值在缩放前后保持不变，手感才是「指着哪里缩哪里」。
 * @param factor      >1 放大跨度（看更宽），<1 收窄跨度（看更细）。
 *
 * 曲线图 / 泳道 / 分面小图共用同一个 TimeWindow，交互只改这个窗口，
 * 三者才会同步；边界处理集中在这里，组件只负责把鼠标位置换成比例。
 */
export function zoomWindow(
  win: TimeWindow,
  domain: TimeWindow,
  anchorRatio: number,
  factor: number,
  minSpan = DAY_MS,
): TimeWindow {
  const dSpan = Math.max(1, domain.end - domain.start);
  const span = Math.max(1, win.end - win.start);
  const a = Math.min(1, Math.max(0, Number.isFinite(anchorRatio) ? anchorRatio : 0.5));
  const floor = Math.min(Math.max(minSpan, dSpan / 500), dSpan);
  const nextSpan = Math.min(dSpan, Math.max(floor, span * (Number.isFinite(factor) ? factor : 1)));
  const anchor = win.start + span * a;
  const start = anchor - nextSpan * a;
  return clampWindow({ start, end: start + nextSpan }, domain, minSpan);
}

/**
 * 平移时间窗口。
 *
 * @param deltaRatio 位移占当前跨度的比例：正值看更晚（窗口右移），负值看更早。
 *   拖拽时传 `(按下点 x - 当前 x) / 绘图宽度`，向左拖即向未来走，符合「抓住图往左拉」。
 */
export function panWindow(
  win: TimeWindow,
  domain: TimeWindow,
  deltaRatio: number,
  minSpan = DAY_MS,
): TimeWindow {
  const span = Math.max(1, win.end - win.start);
  const shift = span * (Number.isFinite(deltaRatio) ? deltaRatio : 0);
  return clampWindow({ start: win.start + shift, end: win.end + shift }, domain, minSpan);
}

export interface Tick {
  t: number;
  label: string;
}

export function makeTicks(win: TimeWindow, gran: Granularity): Tick[] {
  const span = win.end - win.start;
  const out: Tick[] = [];

  if (gran === "year") {
    const y0 = new Date(win.start).getFullYear();
    const y1 = new Date(win.end).getFullYear();
    const count = y1 - y0 + 1;
    const step = count > 10 ? Math.ceil(count / 8) : 1;
    for (let y = y0; y <= y1; y += step) {
      out.push({ t: new Date(y, 0, 1).getTime(), label: String(y) });
    }
    const yearTicks = out.filter((x) => x.t >= win.start && x.t <= win.end);
    if (yearTicks.length >= 2) return yearTicks;
  }

  // 月粒度（或年粒度不足两点时的兜底）
  const d0 = new Date(win.start);
  const cursor = new Date(d0.getFullYear(), d0.getMonth(), 1);
  const months: number[] = [];
  while (cursor.getTime() <= win.end) {
    months.push(cursor.getTime());
    cursor.setMonth(cursor.getMonth() + 1);
  }
  const step = months.length > 9 ? Math.ceil(months.length / 8) : 1;
  const monthTicks = months
    .filter((_, i) => i % step === 0)
    .filter((t) => t >= win.start && t <= win.end)
    .map((t) => ({ t, label: fmtYearMonth(t) }));

  if (monthTicks.length >= 2) return monthTicks;

  // 极窄窗口：仅标首尾
  return [
    { t: win.start, label: fmtYearMonth(win.start) },
    { t: win.end, label: fmtYearMonth(win.end) },
  ];
}

export function posOf(t: number, win: TimeWindow): number {
  const span = win.end - win.start || 1;
  const p = (t - win.start) / span;
  return Math.min(1, Math.max(0, p));
}
