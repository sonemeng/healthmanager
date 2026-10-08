import { getDb } from '@openvitals/database/client';
import type { Database } from '@openvitals/database/client';
import { importJobs, profiles } from '@openvitals/database';
import { eq } from 'drizzle-orm';
import { emitEvent } from '@openvitals/events';
import { classify } from './steps/classify';
import { parse } from './steps/parse';
import { normalize } from './steps/normalize';
import { materialize } from './steps/materialize';

export interface WorkflowContext {
  importJobId: string;
  artifactId: string;
  userId: string;
}

/** 比对用的人名规范化：去除全部空白（中文姓名可能夹带空格/间隔符） */
function normalizePersonName(s: string): string {
  return s.replace(/\s+/g, '');
}

/**
 * 患者姓名核验（2026-10-08）：把报告上的患者名与任务所属档案名比对。
 * 不一致 → 返回警示文案；一致 / 报告未识别出姓名 / 档案无名 → 返回 null。
 * 仅警示不阻断：数据照常落库，任务强制进入复核队列由人工裁决（删除或保留）。
 */
export async function checkPatientNameMismatch(
  db: Database,
  importJobId: string,
  patientName: string | null | undefined,
): Promise<string | null> {
  const reportedName = patientName != null ? normalizePersonName(patientName) : '';
  if (!reportedName) return null;

  const [row] = await db
    .select({ profileName: profiles.name })
    .from(importJobs)
    .innerJoin(profiles, eq(importJobs.profileId, profiles.id))
    .where(eq(importJobs.id, importJobId))
    .limit(1);

  const profileName = row?.profileName ? normalizePersonName(row.profileName) : '';
  if (!profileName || profileName === reportedName) return null;

  return (
    `报告患者姓名（${patientName}）与档案姓名（${row?.profileName}）不一致，` +
    '请确认是否传错人；传错可在上传页删除本单后换正确档案重传'
  );
}

export async function processWorkflow(ctx: WorkflowContext): Promise<void> {
  console.log(`[workflow] Starting ingestion for job=${ctx.importJobId}`);
  const db = getDb();
  emitEvent({
    type: 'import.started',
    payload: { importJobId: ctx.importJobId, artifactId: ctx.artifactId },
    userId: ctx.userId,
    timestamp: new Date(),
  });

  try {
    // Step 1: Classify the document
    const classification = await classify(ctx);
    console.log(`[workflow] Classified as ${classification.documentType} (${classification.confidence})`);

    // If confidence too low, mark for review and stop
    if (classification.confidence < 0.7) {
      console.log(`[workflow] Low confidence, marking for review`);
      await db.update(importJobs)
        .set({ status: 'review_needed', needsReview: true })
        .where(eq(importJobs.id, ctx.importJobId));
      return;
    }

    // Step 2: Parse the document
    const parseResult = await parse(ctx, classification.documentType);
    console.log(`[workflow] Extracted ${parseResult.extractions.length} results`);
    const parseNeedsReview = parseResult.rawMetadata?.needsReview === true;

    // 患者姓名核验：报告患者名 vs 所属档案名（不一致仅警示，不阻断）
    const nameWarning = await checkPatientNameMismatch(db, ctx.importJobId, parseResult.patientName);
    if (nameWarning) console.warn(`[workflow] 患者姓名核验：${nameWarning}`);

    if (parseResult.rawMetadata?.candidates) {
      const [existingJob] = await db.select({ errorDetailJson: importJobs.errorDetailJson })
        .from(importJobs).where(eq(importJobs.id, ctx.importJobId)).limit(1);
      // Preserve the module selected by the user when parser results are saved.
      await db.update(importJobs).set({
        errorDetailJson: { ...(existingJob?.errorDetailJson as Record<string, unknown> | null), ...parseResult.rawMetadata },
      }).where(eq(importJobs.id, ctx.importJobId));
    }

    if (parseResult.extractions.length === 0) {
      const reviewReason = typeof parseResult.rawMetadata?.reviewReason === 'string'
        ? parseResult.rawMetadata.reviewReason
        : null;
      const needsReview = parseNeedsReview || !!nameWarning;
      await db.update(importJobs)
        .set({
          status: needsReview ? 'review_needed' : 'completed',
          extractionCount: 0,
          needsReview,
          errorMessage: [reviewReason, nameWarning].filter(Boolean).join('；') || null,
          completedAt: needsReview ? null : new Date(),
        })
        .where(eq(importJobs.id, ctx.importJobId));
      return;
    }

    // Step 3: Normalize extractions
    const normalization = await normalize(ctx, parseResult.extractions);
    console.log(`[workflow] Normalized ${normalization.normalized.length}, flagged ${normalization.flagged.length}`);

    // Step 4: Materialize to database
    await materialize(ctx, normalization, { forceReview: parseNeedsReview || !!nameWarning });
    console.log(`[workflow] Materialized. Job complete.`);

    // 姓名不一致警示落到任务的复核原因上（materialize 不写 errorMessage，此处不覆盖其它错误：
    // 走到这里说明解析成功，errorMessage 此前只可能为空或上次失败残留，覆盖为当前警示是安全的）
    if (nameWarning) {
      await db.update(importJobs)
        .set({ errorMessage: nameWarning })
        .where(eq(importJobs.id, ctx.importJobId));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[workflow] Failed for job=${ctx.importJobId}:`, message);

    await db.update(importJobs)
      .set({ status: 'failed', errorMessage: message })
      .where(eq(importJobs.id, ctx.importJobId));

    emitEvent({
      type: 'import.failed',
      payload: { importJobId: ctx.importJobId, error: message },
      userId: ctx.userId,
      timestamp: new Date(),
    });
  }
}
