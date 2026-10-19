import { getDb } from '@openvitals/database/client';
import { importJobs, observations } from '@openvitals/database';
import { eq } from 'drizzle-orm';
import { emitEvent } from '@openvitals/events';
import { CONFIDENCE_THRESHOLD, canonicalUnit } from '@openvitals/common';
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
    // 阻断类门禁（spec 21 §4.2）：区间已置空且无可信区间可用 → 该行落 range_pending，
    // 任务进 review_needed，等人工补区间/确认无区间。
    // 提示类（unit_missing / dict_unit_missing）只留痕，不阻断任务（D1 口径：
    // 用户对"没单位"没有可执行动作，拦了只会训练出"见待办就点确认"）。
    const BLOCKING_GATE_CODES = new Set(['unit_mismatch', 'band_mismatch']);
    const isBlocking = (code?: string | null): boolean =>
      code != null && BLOCKING_GATE_CODES.has(code);

    // ── 分级确认（spec 21 §4.10 / D7）：只处理例外 ────────────────────────────
    // 全部满足才自动通过：
    //   ① 分类置信度 ≥ 0.7 —— workflow 已拦，能走到 materialize 即满足
    //   ② 该行无 gateCode —— 含提示类（unit_missing / dict_unit_missing）：有疑虑就让人看一眼
    //   ③ 解析置信度达标
    //   ④ 报告患者姓名与档案一致 —— 由 workflow 折算进 forceReview
    // 机器通过必须与人工背书分开存（auto_verified），否则以后出问题查不出「谁放行的」。
    const canAutoVerify = (obs: (typeof normalized)[number]): boolean =>
      options.forceReview !== true &&
      obs.gateCode == null &&
      obs.confidenceScore >= CONFIDENCE_THRESHOLD;

    // Batch insert observations
    const rows = normalized.map((obs) => ({
      userId: ctx.userId,
      profileId,
      metricCode: obs.metricCode,
      category: obs.category,
      valueNumeric: obs.valueNumeric,
      valueText: obs.valueText,
      // 单位按规范形落库（spec 21 §4.11 / D8）：µ/μ/u 三种写法从入库起就统一，
      // 任何绕过 canonicalUnit 的字符串比较都不会再失配（批次对比曾因此把 7 项判成不可比）
      unit: canonicalUnit(obs.unit) ?? obs.unit,
      referenceRangeLow: obs.referenceRangeLow,
      referenceRangeHigh: obs.referenceRangeHigh,
      referenceRangeText: obs.referenceRangeText,
      isAbnormal: obs.isAbnormal,
      // 状态分级（spec 21 §4.3 + §4.10）：阻断 → range_pending；
      // 满足自动通过条件 → auto_verified（机器放行，可审计）；其余 extracted（待确认）
      status: (isBlocking(obs.gateCode)
        ? 'range_pending'
        : canAutoVerify(obs)
          ? 'auto_verified'
          : 'extracted') as 'range_pending' | 'auto_verified' | 'extracted',
      confidenceScore: obs.confidenceScore,
      observedAt: obs.observedAt,
      observedAtIsFallback: obs.observedAtIsFallback ?? false,
      sourceArtifactId: ctx.artifactId,
      importJobId: ctx.importJobId,
      // AI 识别的原始项目名，界面显示优先用它
      originalValueText: obs.analyte ?? null,
      // 溯源属性：括号剥离内容 / 互认标识 / 区间门禁留痕（C9 + R2 + spec 21）/ 换算留痕（D6）。
      // 均为空则不写列
      metadataJson:
        obs.analyteNote || obs.interopMark || obs.gateReason || obs.conversion
          ? {
              ...(obs.analyteNote ? { analyteNote: obs.analyteNote } : {}),
              ...(obs.interopMark ? { interopMark: obs.interopMark } : {}),
              ...(obs.gateReason ? { gateReason: obs.gateReason } : {}),
              ...(obs.gateCode ? { gateCode: obs.gateCode } : {}),
              ...(obs.conversion ? { conversion: obs.conversion } : {}),
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
  // spec 21 §4.3：阻断类门禁（区间置空 + 待人工给区间）属于**必须**处理的待办 →
  // 计入 needsReview，否则任务会以 completed 收尾，待办无人看见。
  // 提示类（unit_missing / dict_unit_missing）不阻断（D1 拍板）。
  const gatedCount = flagged.filter((f) => f.reason === 'range_unit_mismatch').length;
  const gatedBlockingCount = normalized.filter(
    (obs) => obs.gateCode === 'unit_mismatch' || obs.gateCode === 'band_mismatch',
  ).length;
  const needsReview =
    flaggedForInsert.length > 0 || gatedBlockingCount > 0 || options.forceReview === true;
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
    `${flaggedForInsert.length} flagged, ${gatedCount} range-gated ` +
    `(${gatedBlockingCount} blocking → range_pending), ` +
    `${normalized.filter((o) => options.forceReview !== true && o.gateCode == null && o.confidenceScore >= CONFIDENCE_THRESHOLD).length} auto_verified. ` +
    `Status: ${finalStatus}`
  );
}
