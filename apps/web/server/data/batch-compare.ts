// 批次对比共享计算（spec 20 §3.2，从 observations.ts compareBatches 原样抽离，逻辑零变化）。
// 单一来源：compareBatches（趋势对比页）与 encounterHub/encounterComparison（就诊枢纽卡，
// spec 20 §2/§3）共用同一套批次分组 / 单位换算 / 对齐口径，禁止另造第二套。

import { and, eq, ne, or, isNotNull, asc } from 'drizzle-orm';
import {
  observations,
  metricDefinitions,
  unitConversions,
} from '@openvitals/database';
import type { Database } from '@openvitals/database/client';

// 参与口径（与 compareBatches 既有口径一致）：
// metricCode ≠ 'unmatched' 且 status ≠ 'flagged'；须有数值或文本值。
export async function fetchBatchRows(
  db: Database,
  userId: string,
  profileId: string | null,
): Promise<BatchRow[]> {
  return db
    .select({
      id: observations.id,
      metricCode: observations.metricCode,
      category: observations.category,
      valueNumeric: observations.valueNumeric,
      valueText: observations.valueText,
      unit: observations.unit,
      referenceRangeLow: observations.referenceRangeLow,
      referenceRangeHigh: observations.referenceRangeHigh,
      isAbnormal: observations.isAbnormal,
      status: observations.status,
      observedAt: observations.observedAt,
      updatedAt: observations.updatedAt,
      dictName: metricDefinitions.name,
      dictCategory: metricDefinitions.category,
      dictUnit: metricDefinitions.unit,
      displayPrecision: metricDefinitions.displayPrecision,
      sortOrder: metricDefinitions.sortOrder,
    })
    .from(observations)
    .leftJoin(
      metricDefinitions,
      eq(observations.metricCode, metricDefinitions.id),
    )
    .where(
      and(
        eq(observations.userId, userId),
        ...(profileId ? [eq(observations.profileId, profileId)] : []),
        ne(observations.metricCode, 'unmatched'),
        ne(observations.status, 'flagged'),
        or(
          isNotNull(observations.valueNumeric),
          isNotNull(observations.valueText),
        ),
      ),
    )
    .orderBy(asc(observations.observedAt))
    .limit(5000);
}

export async function fetchConversions(db: Database): Promise<ConversionRow[]> {
  return db.select().from(unitConversions);
}

export interface BatchRow {
  id: string;
  metricCode: string;
  category: string;
  valueNumeric: number | null;
  valueText: string | null;
  unit: string | null;
  referenceRangeLow: number | null;
  referenceRangeHigh: number | null;
  isAbnormal: boolean | null;
  status: string;
  observedAt: Date;
  updatedAt: Date | null;
  dictName: string | null;
  dictCategory: string | null;
  dictUnit: string | null;
  displayPrecision: number | null;
  sortOrder: number | null;
}

export interface ConversionRow {
  fromUnit: string;
  toUnit: string;
  metricCode: string | null;
  multiplier: number;
  offset: number;
}

export interface BatchMetricRow {
  metricCode: string;
  metricName: string;
  category: string;
  sortOrder: number | null;
  displayPrecision: number | null;
  value: number | null;
  valueText: string | null;
  unit: string | null;
  isAbnormal: boolean | null;
  referenceRangeLow: number | null;
  referenceRangeHigh: number | null;
  presence: 'both' | 'new' | 'missing';
  prevDate: string | null;
  prevValue: number | null;
  prevUnit: string | null;
  prevValueText: string | null;
  delta: number | null;
  deltaPercent: number | null;
  direction: 'up' | 'down' | 'flat' | null;
  unitIncomparable: boolean;
}

export interface Batch {
  date: string;
  daysSincePrev: number | null;
  metrics: BatchMetricRow[];
}

// 同一天 = 一次检查；dayKey 用本地时区（与 compareBatches 既有口径一致）
export function dayKeyOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 同指标同天多条 → confirmed/corrected 优先于 extracted，同级取 updatedAt 最新的一条
export function groupRowsByDay(
  rows: BatchRow[],
): Map<string, Map<string, BatchRow>> {
  const statusRank = (s: string) =>
    s === 'confirmed' || s === 'corrected' ? 2 : 1;

  const days = new Map<string, Map<string, BatchRow>>();
  for (const row of rows) {
    const key = dayKeyOf(row.observedAt);
    const byMetric = days.get(key) ?? new Map<string, BatchRow>();
    days.set(key, byMetric);
    const existing = byMetric.get(row.metricCode);
    if (!existing) {
      byMetric.set(row.metricCode, row);
      continue;
    }
    const rankRow = statusRank(row.status);
    const rankExisting = statusRank(existing.status);
    if (
      rankRow > rankExisting ||
      (rankRow === rankExisting &&
        (row.updatedAt?.getTime() ?? 0) >
          (existing.updatedAt?.getTime() ?? 0))
    ) {
      byMetric.set(row.metricCode, row);
    }
  }
  return days;
}

// 换算查找：fromUnit→toUnit，优先指标特定规则，其次全局规则
function buildConvLookup(conversions: ConversionRow[]) {
  const convKey = (from: string, to: string) => `${from}\u0000${to}`;
  const convLookup = new Map<
    string,
    { metricCode: string | null; multiplier: number; offset: number }[]
  >();
  for (const c of conversions) {
    const key = convKey(c.fromUnit, c.toUnit);
    const list = convLookup.get(key) ?? [];
    list.push(c);
    convLookup.set(key, list);
  }
  return (from: string, to: string, metricCode: string) => {
    const list = convLookup.get(convKey(from, to));
    if (!list) return null;
    return (
      list.find((c) => c.metricCode === metricCode) ??
      list.find((c) => c.metricCode === null) ??
      null
    );
  };
}

// 两批次对齐：cur vs prev 的全量对比（presence/delta/单位换算口径与趋势对比页一致）。
// curMap/prevMap 为 groupRowsByDay 的单日 map；prevMap 为 null 时全部视为「新增」。
export function compareTwoDays(
  curMap: Map<string, BatchRow>,
  prevMap: Map<string, BatchRow> | null,
  conversions: ConversionRow[],
  prevDate: string | null,
): BatchMetricRow[] {
  const findConversion = buildConvLookup(conversions);

  const metricCodes = new Set<string>([
    ...curMap.keys(),
    ...(prevMap?.keys() ?? []),
  ]);

  const metrics = Array.from(metricCodes).map((code) => {
    const curRow = curMap.get(code) ?? null;
    const prevRow = prevMap?.get(code) ?? null;
    const dictRow = curRow ?? prevRow!;
    const presence: 'both' | 'new' | 'missing' =
      curRow && prevRow ? 'both' : curRow ? 'new' : 'missing';

    let delta: number | null = null;
    let deltaPercent: number | null = null;
    let direction: 'up' | 'down' | 'flat' | null = null;
    let unitIncomparable = false;

    if (
      curRow &&
      prevRow &&
      curRow.valueNumeric != null &&
      prevRow.valueNumeric != null
    ) {
      let curVal = curRow.valueNumeric;
      let prevVal = prevRow.valueNumeric;
      const curUnit = curRow.unit ?? null;
      const prevUnit = prevRow.unit ?? null;
      const dictUnit = dictRow.dictUnit ?? null;

      if (curUnit !== prevUnit) {
        // 单位不一致：双方换算到字典基准单位再比；无规则 → 单位不可比
        const toBase = (v: number, u: string | null): number | null => {
          if (u === dictUnit) return v;
          if (!u || !dictUnit) return null;
          const conv = findConversion(u, dictUnit, code);
          if (!conv) return null;
          return v * conv.multiplier + conv.offset;
        };
        const curBase = toBase(curVal, curUnit);
        const prevBase = toBase(prevVal, prevUnit);
        if (curBase == null || prevBase == null) {
          unitIncomparable = true;
        } else {
          curVal = curBase;
          prevVal = prevBase;
        }
      }

      if (!unitIncomparable) {
        delta = curVal - prevVal;
        deltaPercent =
          prevVal !== 0 ? (delta / Math.abs(prevVal)) * 100 : null;
        direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
      }
    }

    return {
      metricCode: code,
      metricName: dictRow.dictName ?? code,
      category: dictRow.dictCategory ?? dictRow.category,
      sortOrder: dictRow.sortOrder ?? null,
      displayPrecision: dictRow.displayPrecision ?? null,
      value: curRow?.valueNumeric ?? null,
      valueText: curRow?.valueText ?? null,
      unit: curRow?.unit ?? null,
      isAbnormal: curRow?.isAbnormal ?? null,
      referenceRangeLow: curRow?.referenceRangeLow ?? null,
      referenceRangeHigh: curRow?.referenceRangeHigh ?? null,
      presence,
      prevDate,
      prevValue: prevRow?.valueNumeric ?? null,
      prevUnit: prevRow?.unit ?? null,
      prevValueText: prevRow?.valueText ?? null,
      delta,
      deltaPercent,
      direction,
      unitIncomparable,
    };
  });

  metrics.sort((a, b) => {
    const cat = a.category.localeCompare(b.category);
    if (cat !== 0) return cat;
    const so = (a.sortOrder ?? 1e9) - (b.sortOrder ?? 1e9);
    if (so !== 0) return so;
    return a.metricName.localeCompare(b.metricName, 'zh');
  });

  return metrics;
}

// 批次按日期倒序（最新在前），每次 vs 紧邻上一次（趋势对比页既有口径）
export function buildBatches(
  days: Map<string, Map<string, BatchRow>>,
  conversions: ConversionRow[],
): Batch[] {
  const dateKeys = Array.from(days.keys()).sort(); // 升序（旧 → 新）

  const batches = [];
  for (let i = dateKeys.length - 1; i >= 0; i--) {
    const cur = days.get(dateKeys[i]!)!;
    const prev = i > 0 ? days.get(dateKeys[i - 1]!)! : null;
    const curDate = dateKeys[i]!;
    const prevDate = i > 0 ? dateKeys[i - 1]! : null;
    const daysSincePrev = prevDate
      ? Math.round(
          (new Date(`${curDate}T00:00:00`).getTime() -
            new Date(`${prevDate}T00:00:00`).getTime()) /
            86_400_000,
        )
      : null;

    batches.push({
      date: curDate,
      daysSincePrev,
      metrics: compareTwoDays(cur, prev, conversions, prevDate),
    });
  }

  return batches;
}
