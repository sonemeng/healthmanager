import type { Database } from '@openvitals/database/client';
import { importJobs, metricDefinitions, referenceRanges, users, profiles } from '@openvitals/database';
import { eq } from 'drizzle-orm';
import type { MetricDefinition, UserDemographics, DemographicRange } from '@openvitals/ingestion';

/**
 * 字典 + 区间 + 人口学的装载（spec 21 S2 抽离）。
 *
 * 抽出来的原因：`normalize`（入库主链路）与 `recompute`（区间重算）必须用**同一份**
 * 装载逻辑与**同一个** resolveReferenceRange。抄第二份的代价是两处口径漂移——
 * 那正是 spec 21 §4.6 说的「半年后闸门变垃圾桶」的成因。
 */

/** 把 reference_ranges 行映射成归一化器认识的形状（字段口径改动必须两处同步——所以只此一处） */
export function toDemographicRange(r: {
  sex: string | null;
  ageMin: number | null;
  ageMax: number | null;
  rangeLow: number | null;
  rangeHigh: number | null;
  unit: string | null;
  sourceTier?: string | null;
  conflictStatus?: string | null;
}): DemographicRange {
  return {
    sex: r.sex,
    ageMin: r.ageMin,
    ageMax: r.ageMax,
    rangeLow: r.rangeLow,
    rangeHigh: r.rangeHigh,
    // spec 19：NULL=字典基准行；非 NULL=学习行（互认标识/检验科区间，Priority-2a 单位匹配）
    unit: r.unit ?? null,
    // spec 21（S0b）：来源等级与冲突标定——2a 不再按 range_low 任意取首行
    sourceTier: r.sourceTier ?? null,
    conflictStatus: r.conflictStatus ?? null,
  };
}

export function groupRangesByMetric(
  ranges: Array<Parameters<typeof toDemographicRange>[0] & { metricCode: string }>,
): Map<string, DemographicRange[]> {
  const map = new Map<string, DemographicRange[]>();
  for (const r of ranges) {
    const list = map.get(r.metricCode) ?? [];
    list.push(toDemographicRange(r));
    map.set(r.metricCode, list);
  }
  return map;
}

/** 字典行 → 归一化器输入。第二遍（自学习后重查刷新）也走这里，保证两遍口径一致。 */
export function buildMetricDefinitions(
  metrics: Array<{
    id: string;
    name: string;
    category: string;
    unit: string | null;
    aliases: unknown;
    referenceRangeLow: number | null;
    referenceRangeHigh: number | null;
    sourceTier: string | null;
    unitKind: string | null;
  }>,
  rangesByMetric: Map<string, DemographicRange[]>,
): MetricDefinition[] {
  return metrics.map((m) => ({
    id: m.id,
    name: m.name,
    category: m.category,
    unit: m.unit,
    aliases: (m.aliases as string[]) ?? [],
    referenceRangeLow: m.referenceRangeLow,
    referenceRangeHigh: m.referenceRangeHigh,
    sourceTier: m.sourceTier ?? null,
    // spec 21（S1）：定性/无量纲判据，决定是否进门禁
    unitKind: m.unitKind ?? null,
    demographicRanges: rangesByMetric.get(m.id),
  }));
}

export interface ReferenceContext {
  metrics: Awaited<ReturnType<typeof loadMetricRows>>;
  rangesByMetric: Map<string, DemographicRange[]>;
  metricDefs: MetricDefinition[];
}

async function loadMetricRows(db: Database) {
  return db.select().from(metricDefinitions);
}

export async function loadReferenceContext(db: Database): Promise<ReferenceContext> {
  const [metrics, ranges] = await Promise.all([
    loadMetricRows(db),
    db.select().from(referenceRanges),
  ]);
  const rangesByMetric = groupRangesByMetric(ranges);
  return { metrics, rangesByMetric, metricDefs: buildMetricDefinitions(metrics, rangesByMetric) };
}

/**
 * 人口学信息取自**本次任务所属档案**，不是账号本人：
 * 一个账号下有多个档案（本人/家人），血常规、胆红素、ALP 的参考区间按性别/年龄分档，
 * 用账号性别会把「刘丙友（男）」的报告套成「吴菊兰（女）」的区间，反向也一样。
 * 档案未填性别/生日时，才回退到账号（保持旧行为，不至于退化成「无人区」）。
 */
export async function loadDemographics(
  db: Database,
  params: { userId: string; profileId: string | null },
): Promise<UserDemographics | null> {
  const [profile] = params.profileId
    ? await db
        .select({ gender: profiles.gender, birthDate: profiles.birthDate })
        .from(profiles)
        .where(eq(profiles.id, params.profileId))
        .limit(1)
    : [];

  const [user] = await db
    .select({ dateOfBirth: users.dateOfBirth, biologicalSex: users.biologicalSex })
    .from(users)
    .where(eq(users.id, params.userId))
    .limit(1);

  const sex = profile?.gender ?? user?.biologicalSex ?? null;
  const birthDate = profile?.birthDate ?? user?.dateOfBirth ?? null;

  if (sex === null && birthDate === null) return null;

  let ageInYears: number | null = null;
  if (birthDate) {
    const dob = new Date(birthDate);
    const now = new Date();
    ageInYears = now.getFullYear() - dob.getFullYear();
    const monthDiff = now.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
      ageInYears--;
    }
  }
  return { sex, ageInYears };
}

/** 按导入任务取人口学（任务 → 档案 → 账号三级回退） */
export async function loadDemographicsForJob(
  db: Database,
  params: { userId: string; importJobId: string },
): Promise<UserDemographics | null> {
  const [job] = await db
    .select({ profileId: importJobs.profileId })
    .from(importJobs)
    .where(eq(importJobs.id, params.importJobId))
    .limit(1);
  return loadDemographics(db, { userId: params.userId, profileId: job?.profileId ?? null });
}
