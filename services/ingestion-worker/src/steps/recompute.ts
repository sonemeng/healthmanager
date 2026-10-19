import { getDb } from '@openvitals/database/client';
import type { Database } from '@openvitals/database/client';
import { observations } from '@openvitals/database';
import { and, eq, inArray, or, isNull } from 'drizzle-orm';
import { resolveReferenceRange } from '@openvitals/ingestion';
import type { RawExtraction } from '@openvitals/ingestion';
import { loadDemographics, loadReferenceContext } from '../lib/reference-context';

/**
 * 区间重算（spec 21 §4.6）。
 *
 * 只做一件事：对该行**重新跑一遍** resolveReferenceRange + 判读公式，把结果写回
 * referenceRangeLow/High、isAbnormal、metadata_json。**不碰值、不碰单位、不碰 metricCode**，
 * 也不调用任何模型。所以它便宜到可以随时跑，也可以当作「改挂指标后」的收尾。
 *
 * 为什么要它是独立的一步而不是"入库时算一次就完了"：
 * 门禁结论是**入库那一刻的快照**。字典修好了、学习行补上了、指标改挂了，
 * 库里那串空区间与 gateReason 不会自己变——不重算就会永久堆积幽灵待办
 * （实测 5 条历史留痕里 4 条都是这种）。这是 spec 21 里唯一能防止闸门变垃圾桶的机制。
 */

/** 阻断类门禁：命中即该行不能算处理完 */
const BLOCKING_GATE_CODES = new Set(['unit_mismatch', 'band_mismatch']);

export interface RecomputeParams {
  userId: string;
  /** 指定行（改挂指标后用）。与 importJobId 至少给一个 */
  observationIds?: string[];
  /** 指定任务（处理完学习行后整单自愈用） */
  importJobId?: string;
  /**
   * 是否连「已有区间」的行一起重算。
   * 默认 false：库里已存的区间可能来自**报告原文**（优先级 1），重算会把它覆盖成字典区间，
   * 那是数据损失而不是自愈。只有明确知道这串区间已经失效（改挂指标）时才置 true。
   */
  includeExisting?: boolean;
}

export interface RecomputeResult {
  scanned: number;
  /** 已有区间且未要求强制重算 → 跳过 */
  skippedExisting: number;
  /** 明确取到区间（含与原来相同） */
  resolved: number;
  /** 重算后仍被阻断（status 保持/转为 range_pending） */
  stillGated: number;
  /** 定性/无值 → 豁免，区间留空 */
  exempted: number;
  /** 指标不在字典里（unmatched / 已删除）→ 无法重算 */
  missingMetric: number;
  /** 本次由 range_pending 转为 extracted 的行数 */
  released: number;
  /** 实际写回库的行数（含「只清掉幽灵 gateReason」这种没有区间变化的行） */
  changed: number;
}

export async function recomputeObservationRanges(
  params: RecomputeParams,
): Promise<RecomputeResult> {
  const { userId, observationIds, importJobId, includeExisting = false } = params;

  if (!observationIds?.length && !importJobId) {
    throw new Error('recompute 需要 observationIds 或 importJobId');
  }

  const db = getDb();
  const where = and(
    eq(observations.userId, userId),
    ...(observationIds?.length ? [inArray(observations.id, observationIds)] : []),
    ...(importJobId ? [eq(observations.importJobId, importJobId)] : []),
    // 已被人背书过的行不重算：confirmed/corrected 是人的决定，机器不许翻案
    or(
      eq(observations.status, 'range_pending'),
      eq(observations.status, 'extracted'),
      eq(observations.status, 'auto_verified'),
    )!,
  );

  const rows = await db.select().from(observations).where(where);
  const { metricDefs } = await loadReferenceContext(db);
  const metricById = new Map(metricDefs.map((m) => [m.id, m]));

  // 同一任务的行共用同一份人口学，按 profileId 缓存
  const demographicsCache = new Map<string | null, Awaited<ReturnType<typeof loadDemographics>>>();
  const demographicsFor = async (profileId: string | null) => {
    if (!demographicsCache.has(profileId)) {
      demographicsCache.set(
        profileId,
        await loadDemographics(db, { userId, profileId }),
      );
    }
    return demographicsCache.get(profileId) ?? null;
  };

  const result: RecomputeResult = {
    scanned: rows.length,
    skippedExisting: 0,
    resolved: 0,
    stillGated: 0,
    exempted: 0,
    missingMetric: 0,
    released: 0,
    changed: 0,
  };

  for (const row of rows) {
    // 已有区间：默认不动（可能是报告原文）；改挂指标时由调用方显式强制
    if (!includeExisting && (row.referenceRangeLow !== null || row.referenceRangeHigh !== null)) {
      result.skippedExisting += 1;
      continue;
    }

    const metric = row.metricCode ? metricById.get(row.metricCode) : undefined;
    if (!metric) {
      result.missingMetric += 1;
      continue;
    }

    // 关键：把报告原文区间置空再解析。库里那一串区间正是要重算的结论，
    // 拿它当输入等于「用错的答案验证错的答案」（优先级 1 会直接返回它）。
    const extraction: RawExtraction = {
      analyte: row.originalValueText ?? metric.name,
      value: row.valueNumeric,
      valueText: row.valueText,
      unit: row.unit,
      referenceRangeLow: null,
      referenceRangeHigh: null,
      referenceRangeText: null,
      isAbnormal: null,
      observedAt: row.observedAt ? new Date(row.observedAt).toISOString() : null,
    };

    const demographics = await demographicsFor(row.profileId);
    const range = resolveReferenceRange(extraction, metric, demographics);

    const blocked = range.gated === true && range.gateCode != null && BLOCKING_GATE_CODES.has(range.gateCode);
    const hasRange = range.low !== null || range.high !== null;

    if (range.exempted) {
      result.exempted += 1;
    } else if (blocked) {
      result.stillGated += 1;
    } else if (hasRange) {
      result.resolved += 1;
    }

    // 判读：有区间就按区间重算（单侧区间只判有界的一侧）；
    // 无区间时**保留原判读**——报告自身的 ↑/↓ 没有单独存列，
    // 归零等于把「报告说异常」这个信息删掉，比留空更糟。
    const isAbnormal =
      row.valueNumeric !== null && hasRange
        ? (range.high !== null && row.valueNumeric > range.high) ||
          (range.low !== null && row.valueNumeric < range.low)
        : row.isAbnormal;

    // 状态：只在「机器还没被背书过」的两种状态之间移动
    let status = row.status;
    if (blocked) {
      status = 'range_pending';
    } else if (row.status === 'range_pending') {
      // 阻断解除 → 回到「待确认」，交给人点确认；不假他人之手自动 confirmed
      status = 'extracted';
      result.released += 1;
    }

    const meta = { ...((row.metadataJson as Record<string, unknown> | null) ?? {}) };
    if (blocked) {
      meta.gateCode = range.gateCode;
      meta.gateReason = range.gateReason;
    } else {
      delete meta.gateCode;
      delete meta.gateReason;
    }
    const metadataJson = Object.keys(meta).length > 0 ? meta : null;

    const changed =
      row.referenceRangeLow !== range.low ||
      row.referenceRangeHigh !== range.high ||
      row.isAbnormal !== isAbnormal ||
      row.status !== status ||
      JSON.stringify(row.metadataJson ?? null) !== JSON.stringify(metadataJson);
    if (!changed) continue;

    await db
      .update(observations)
      .set({
        referenceRangeLow: range.low,
        referenceRangeHigh: range.high,
        isAbnormal,
        status,
        metadataJson,
        updatedAt: new Date(),
      })
      .where(and(eq(observations.id, row.id), eq(observations.userId, userId)));
    result.changed += 1;
  }

  // 重算可能让待办归零 → 任务该转 completed（与 confirm 的收尾同一条判定）
  if (importJobId) {
    const remaining = await db
      .select({ id: observations.id })
      .from(observations)
      .where(
        and(
          eq(observations.importJobId, importJobId),
          eq(observations.userId, userId),
          inArray(observations.status, ['extracted', 'flagged', 'range_pending']),
        ),
      )
      .limit(1);

    if (remaining.length === 0) {
      const { importJobs } = await import('@openvitals/database');
      await db
        .update(importJobs)
        .set({ status: 'completed', needsReview: false, completedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(importJobs.id, importJobId), eq(importJobs.userId, userId)));
    }
  }

  console.log(
    `[recompute] scanned=${result.scanned} resolved=${result.resolved} gated=${result.stillGated} ` +
      `exempted=${result.exempted} released=${result.released} skipped=${result.skippedExisting}`,
  );
  return result;
}
