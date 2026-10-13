// 就诊枢纽数据共享模块（spec 20 §2/§3，v0.1.16 从 encounters.ts 路由原样抽离，逻辑零变化）。
// 单一来源：encounters 路由（枢纽卡/前后对比）与 ai.encounterSummary（P3 AI 就诊摘要）
// 共用同一套 ±7 天批次 / 时点用药 / 时点病史 / 前后对比口径，禁止另造第二套。

import { and, eq, lte, gte, or, isNull } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { encounters, medications, conditions } from '@openvitals/database';
import type { Database } from '@openvitals/database/client';
import {
  fetchBatchRows,
  fetchConversions,
  groupRowsByDay,
  compareTwoDays,
  dayKeyOf,
  type BatchMetricRow,
} from './batch-compare';

export type EncounterRow = typeof encounters.$inferSelect;

// 日期字符串（YYYY-MM-DD）加减天数 → dayKey
export function addDaysKey(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setDate(d.getDate() + days);
  return dayKeyOf(d);
}

export function gapDays(fromKey: string, toKey: string): number {
  return Math.round(
    (new Date(`${toKey}T00:00:00`).getTime() -
      new Date(`${fromKey}T00:00:00`).getTime()) /
      86_400_000,
  );
}

// 按权限取就诊（userId 必查 + profileId 过滤），不存在/越权抛 NOT_FOUND
export async function loadEncounter(
  db: Database,
  userId: string,
  profileId: string | null,
  encounterId: string,
): Promise<EncounterRow> {
  const [encounter] = await db
    .select()
    .from(encounters)
    .where(
      and(
        eq(encounters.id, encounterId),
        eq(encounters.userId, userId),
        ...(profileId ? [eq(encounters.profileId, profileId)] : []),
      ),
    )
    .limit(1);

  if (!encounter) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Encounter not found' });
  }
  return encounter;
}

export interface HubBatch {
  date: string;
  total: number;
  abnormal: number;
  metrics: BatchMetricRow[];
}

export interface HubMedication {
  id: string;
  name: string;
  dosage: string | null;
  frequency: string | null;
  startDate: string | null;
  endDate: string | null;
}

export interface HubCondition {
  id: string;
  name: string;
  status: string | null;
  onsetDate: string | null;
}

export interface EncounterHubData {
  encounterDate: string;
  windowStart: string;
  windowEnd: string;
  batches: HubBatch[];
  medsAtVisit: HubMedication[];
  conditionsAtVisit: HubCondition[];
}

// 就诊枢纽卡（spec 20 §2）：±7 天检验批次 + 时点用药 + 时点病史
export async function buildEncounterHub(
  db: Database,
  userId: string,
  profileId: string | null,
  encounter: EncounterRow,
): Promise<EncounterHubData> {
  const D = encounter.encounterDate;
  const winStartKey = addDaysKey(D, -7);
  const winEndKey = addDaysKey(D, 7);

  const [rows, conversions] = await Promise.all([
    fetchBatchRows(db, userId, profileId),
    fetchConversions(db),
  ]);

  const days = groupRowsByDay(rows);
  const batchKeys = Array.from(days.keys())
    .filter((k) => k >= winStartKey && k <= winEndKey)
    .sort();

  const batches = batchKeys.map((k) => {
    const metrics = compareTwoDays(days.get(k)!, null, conversions, null);
    return {
      date: k,
      total: metrics.length,
      abnormal: metrics.filter((m) => m.isAbnormal === true).length,
      metrics,
    };
  });

  const medsAtVisit = await db
    .select({
      id: medications.id,
      name: medications.name,
      dosage: medications.dosage,
      frequency: medications.frequency,
      startDate: medications.startDate,
      endDate: medications.endDate,
    })
    .from(medications)
    .where(
      and(
        eq(medications.userId, userId),
        ...(profileId ? [eq(medications.profileId, profileId)] : []),
        or(isNull(medications.startDate), lte(medications.startDate, D)),
        or(isNull(medications.endDate), gte(medications.endDate, D)),
      ),
    )
    .orderBy(medications.name);

  const conditionsAtVisit = await db
    .select({
      id: conditions.id,
      name: conditions.name,
      status: conditions.status,
      onsetDate: conditions.onsetDate,
    })
    .from(conditions)
    .where(
      and(
        eq(conditions.userId, userId),
        ...(profileId ? [eq(conditions.profileId, profileId)] : []),
        or(
          // 在患中且就诊前已起病（起病未填视为长期在患）
          and(
            eq(conditions.status, 'active'),
            or(isNull(conditions.onsetDate), lte(conditions.onsetDate, D)),
          ),
          // 已愈但就诊时点尚未痊愈
          and(
            lte(conditions.onsetDate, D),
            or(
              isNull(conditions.resolutionDate),
              gte(conditions.resolutionDate, D),
            ),
          ),
        ),
      ),
    )
    .orderBy(conditions.name);

  return {
    encounterDate: D,
    windowStart: winStartKey,
    windowEnd: winEndKey,
    batches,
    medsAtVisit,
    conditionsAtVisit,
  };
}

export interface EncounterComparisonData {
  encounterDate: string;
  before: { date: string; gapDays: number } | null;
  after: { date: string; gapDays: number } | null;
  daysBetween: number | null;
  metrics: BatchMetricRow[];
}

// 就诊前后疗效对比（spec 20 §3，2026-10-13 拍板：不限窗口取最近）：
// before = 观测日期 ≤ D 的最近批次；after = > D 的最近批次。
export async function buildEncounterComparison(
  db: Database,
  userId: string,
  profileId: string | null,
  encounter: EncounterRow,
): Promise<EncounterComparisonData> {
  const D = encounter.encounterDate;

  const [rows, conversions] = await Promise.all([
    fetchBatchRows(db, userId, profileId),
    fetchConversions(db),
  ]);

  const days = groupRowsByDay(rows);
  const keys = Array.from(days.keys()).sort();

  const beforeKey = keys.findLast((k) => k <= D) ?? null;
  const afterKey = keys.find((k) => k > D) ?? null;

  const before = beforeKey
    ? { date: beforeKey, gapDays: gapDays(beforeKey, D) }
    : null;
  const after = afterKey ? { date: afterKey, gapDays: gapDays(D, afterKey) } : null;
  const daysBetween =
    beforeKey && afterKey ? gapDays(beforeKey, afterKey) : null;

  let metrics: BatchMetricRow[] = [];
  if (beforeKey && afterKey) {
    metrics = compareTwoDays(
      days.get(afterKey)!,
      days.get(beforeKey)!,
      conversions,
      beforeKey,
    );
  } else if (afterKey && !beforeKey) {
    // 就诊前无检查记录：after 即首次检查，全部视为新增
    metrics = compareTwoDays(days.get(afterKey)!, null, conversions, null);
  }

  return { encounterDate: D, before, after, daysBetween, metrics };
}
