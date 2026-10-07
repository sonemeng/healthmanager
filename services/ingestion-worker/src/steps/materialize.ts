import { getDb } from '@openvitals/database/client';
import { importJobs, observations } from '@openvitals/database';
import { eq } from 'drizzle-orm';
import { emitEvent } from '@openvitals/events';
import type { WorkflowContext } from '../workflow';
import type { NormalizationResult } from '@openvitals/ingestion';

export async function materialize(
  ctx: WorkflowContext,
  normalization: NormalizationResult,
  options: { forceReview?: boolean } = {},
): Promise<void> {
  const db = getDb();

  const { normalized, flagged } = normalization;

  // 继承任务归属的成员档案
  const [jobRow] = await db
    .select({ profileId: importJobs.profileId })
    .from(importJobs)
    .where(eq(importJobs.id, ctx.importJobId))
    .limit(1);
  const profileId = jobRow?.profileId ?? null;

  if (normalized.length > 0) {
    // Batch insert observations
    const rows = normalized.map((obs) => ({
      userId: ctx.userId,
      profileId,
      metricCode: obs.metricCode,
      category: obs.category,
      valueNumeric: obs.valueNumeric,
      valueText: obs.valueText,
      unit: obs.unit,
      referenceRangeLow: obs.referenceRangeLow,
      referenceRangeHigh: obs.referenceRangeHigh,
      referenceRangeText: obs.referenceRangeText,
      isAbnormal: obs.isAbnormal,
      status: 'extracted' as const,
      confidenceScore: obs.confidenceScore,
      observedAt: obs.observedAt,
      observedAtIsFallback: obs.observedAtIsFallback ?? false,
      sourceArtifactId: ctx.artifactId,
      importJobId: ctx.importJobId,
      // AI 识别的原始项目名，界面显示优先用它
      originalValueText: obs.analyte ?? null,
      // 溯源属性：括号剥离内容 / 互认标识 / 区间门禁留痕（C9 + R2）。均为空则不写列
      metadataJson:
        obs.analyteNote || obs.interopMark || obs.gateReason
          ? {
              ...(obs.analyteNote ? { analyteNote: obs.analyteNote } : {}),
              ...(obs.interopMark ? { interopMark: obs.interopMark } : {}),
              ...(obs.gateReason ? { gateReason: obs.gateReason } : {}),
            }
          : null,
    }));

    const inserted = await db.insert(observations).values(rows).returning({ id: observations.id });

    // Emit events for each observation
    inserted.forEach((row, index) => {
      const observation = normalized[index];
      emitEvent({
        type: 'observation.created',
        payload: {
          observationId: row.id,
          metricCode: observation?.metricCode ?? '',
          category: observation?.category ?? '',
          importJobId: ctx.importJobId,
        },
        userId: ctx.userId,
        timestamp: new Date(),
      });
    });
  }

  // flagged 行（未匹配/单位不明/低置信）→ status='flagged' 落库，进入待人工确认
  // 例外：'range_unit_mismatch' 的抽取项**已经**以 matched 指标（区间置空）落过库了，
  // 若再以 metricCode='unmatched' 插一条会造成同一数据重复入库 + 假复核项 → 跳过。
  const flaggedForInsert = flagged.filter((f) => f.reason !== 'range_unit_mismatch');
  if (flaggedForInsert.length > 0) {
    const flaggedRows = flaggedForInsert.map((f) => ({
      userId: ctx.userId,
      profileId,
      // 保留字，observations.metric_code 无 FK 可安全使用
      metricCode: 'unmatched',
      category: f.extraction.category ?? 'lab_result',
      valueNumeric: f.extraction.value,
      valueText: f.extraction.valueText,
      unit: f.extraction.unit,
      referenceRangeLow: f.extraction.referenceRangeLow,
      referenceRangeHigh: f.extraction.referenceRangeHigh,
      referenceRangeText: f.extraction.referenceRangeText,
      isAbnormal: f.extraction.isAbnormal,
      status: 'flagged' as const,
      // 无日期时用当前时刻占位并标记 fallback（不再冒充检查时刻）
      observedAt: f.extraction.observedAt ? new Date(f.extraction.observedAt) : new Date(),
      observedAtIsFallback: !f.extraction.observedAt,
      sourceArtifactId: ctx.artifactId,
      importJobId: ctx.importJobId,
      // ★ AI 识别的原始项目名
      originalValueText: f.extraction.analyte,
      // hover 提示用
      correctionNote: `${f.reason}: ${f.details}`,
    }));

    await db.insert(observations).values(flaggedRows);
  }

  // Determine final status（flagged 不计入 extractionCount）
  // 注意：仅 'range_unit_mismatch' 不触发 review —— 该行已按 matched 指标正常落库，
  // 只是区间留空（值为 null 方向待确认），不构成必须人工介入的阻断项。
  const gatedCount = flagged.filter((f) => f.reason === 'range_unit_mismatch').length;
  const needsReview = flaggedForInsert.length > 0 || options.forceReview === true;
  const finalStatus = needsReview ? 'review_needed' : 'completed';

  await db.update(importJobs)
    .set({
      status: finalStatus,
      extractionCount: normalized.length,
      needsReview,
      completedAt: new Date(),
    })
    .where(eq(importJobs.id, ctx.importJobId));

  emitEvent({
    type: 'import.completed',
    payload: {
      importJobId: ctx.importJobId,
      observationCount: normalized.length,
    },
    userId: ctx.userId,
    timestamp: new Date(),
  });

  console.log(
    `[materialize] Inserted ${normalized.length} observations, ` +
    `${flaggedForInsert.length} flagged, ${gatedCount} range-gated (区间置空). Status: ${finalStatus}`
  );
}
