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
      sourceArtifactId: ctx.artifactId,
      importJobId: ctx.importJobId,
      // AI 识别的原始项目名，界面显示优先用它
      originalValueText: obs.analyte ?? null,
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
  if (flagged.length > 0) {
    const flaggedRows = flagged.map((f) => ({
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
      observedAt: f.extraction.observedAt ? new Date(f.extraction.observedAt) : new Date(),
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
  const needsReview = flagged.length > 0 || options.forceReview === true;
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
    `${flagged.length} flagged. Status: ${finalStatus}`
  );
}
