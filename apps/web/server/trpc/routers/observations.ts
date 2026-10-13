import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and, inArray, ne, or, isNotNull, isNull, asc } from 'drizzle-orm';
import { createRouter, protectedProcedure } from '../init';
import type { Database } from '@openvitals/database/client';
import {
  listObservations,
  getObservationTrend,
  getObservationWithProvenance,
  observations,
  importJobs,
  metricDefinitions,
  referenceRanges,
  unitConversions,
} from '@openvitals/database';
import { emitEvent } from '@openvitals/events';
import { getActiveProfileId } from '../active-profile';
import {
  groupRowsByDay,
  buildBatches,
  fetchBatchRows,
  fetchConversions,
} from '../../data/batch-compare';

/**
 * 化验单区间学习入库（spec 19 §4 C2 + 2026-10-12 用户拍板）：
 * 被确认/纠正的观测行带报告原文区间时，先查后插写入学习行——
 * source 优先取观测行 metadata_json 的互认标识（如「陕HR」），无标识兜底「检验科区间」。
 * 幂等键 = (metric_code, unit, low, high)（学习行 unit 非 NULL，同值不同标识不重复入库、先到先得）；
 * 无单位或无区间不收（unit NULL 保留给字典基准行）。失败不阻断确认/纠正主流程（崩溃安全）。
 */
async function ensureLearnedRange(
  db: Database,
  row: {
    metricCode: string | null;
    unit: string | null;
    rangeLow: number | null;
    rangeHigh: number | null;
    metadataJson: unknown;
  },
): Promise<void> {
  try {
    const { metricCode, unit, rangeLow, rangeHigh, metadataJson } = row;
    if (!metricCode) return;
    if (!unit || unit.trim() === '') return;
    if (rangeLow === null && rangeHigh === null) return;

    // 互认标识（如「陕HR」）：只收非空字符串，其余一律兜底专业口径
    const mark = (metadataJson as { interopMark?: unknown } | null)?.interopMark;
    const source =
      typeof mark === 'string' && mark.trim() !== '' ? mark.trim() : '检验科区间';

    const existing = await db
      .select({ id: referenceRanges.id })
      .from(referenceRanges)
      .where(
        and(
          eq(referenceRanges.metricCode, metricCode),
          eq(referenceRanges.unit, unit),
          isNotNull(referenceRanges.unit),
          rangeLow === null
            ? isNull(referenceRanges.rangeLow)
            : eq(referenceRanges.rangeLow, rangeLow),
          rangeHigh === null
            ? isNull(referenceRanges.rangeHigh)
            : eq(referenceRanges.rangeHigh, rangeHigh),
        ),
      )
      .limit(1);
    if (existing.length > 0) return;

    await db
      .insert(referenceRanges)
      .values({
        metricCode,
        sex: null,
        ageMin: null,
        ageMax: null,
        rangeLow,
        rangeHigh,
        rangeText: null,
        source,
        unit,
      })
      .onConflictDoNothing();
  } catch (err) {
    console.error('[observations] ensureLearnedRange failed:', err instanceof Error ? err.message : err);
  }
}

export const observationsRouter = createRouter({
  list: protectedProcedure
    .input(z.object({
      category: z.string().optional(),
      metricCode: z.string().optional(),
      dateFrom: z.date().optional(),
      dateTo: z.date().optional(),
      status: z.string().optional(),
      limit: z.number().min(1).max(200).default(50),
      cursor: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const offset = input.cursor ? parseInt(input.cursor, 10) : 0;
      const profileId = await getActiveProfileId(ctx.userId);
      const items = await listObservations(ctx.db, {
        userId: ctx.userId,
        profileId,
        category: input.category,
        metricCode: input.metricCode,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        status: input.status,
        limit: input.limit + 1,
        offset,
      });

      let nextCursor: string | null = null;
      if (items.length > input.limit) {
        items.pop();
        nextCursor = String(offset + input.limit);
      }

      return { items, nextCursor };
    }),

  trend: protectedProcedure
    .input(z.object({
      metricCode: z.string(),
      dateFrom: z.date(),
      dateTo: z.date(),
      granularity: z.enum(['raw', 'daily', 'weekly', 'monthly']).default('raw'),
    }))
    .query(async ({ ctx, input }) => {
      const rows = await getObservationTrend(ctx.db, {
        userId: ctx.userId,
        profileId: await getActiveProfileId(ctx.userId),
        metricCode: input.metricCode,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
      });

      const dataPoints = rows.map((r) => ({
        date: r.observedAt,
        value: r.valueNumeric,
        unit: r.unit,
      }));

      return { dataPoints };
    }),

  // 批次对比：同一天 = 一次检查（observedAt 按日聚合，同指标同天取最新确认的一条），
  // 每次检查 vs 紧邻上一次的全量对比（spec 16 §1）。
  // 参与口径：metricCode ≠ 'unmatched' 且 status ≠ 'flagged'；单位不一致时经
  // unit_conversions 换算到字典基准单位，无换算规则的指标标记「单位不可比」不比。
  // 分组/对齐计算在 server/data/batch-compare.ts（spec 20 §3.2 抽离共享，
  // 与就诊前后疗效对比 encounterComparison 同一来源）。
  compareBatches: protectedProcedure
    .query(async ({ ctx }) => {
      const profileId = await getActiveProfileId(ctx.userId);

      const rows = await fetchBatchRows(ctx.db, ctx.userId, profileId);
      const conversions = await fetchConversions(ctx.db);

      const days = groupRowsByDay(rows);
      const batches = buildBatches(days, conversions);

      return { batches };
    }),

  getWithProvenance: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const result = await getObservationWithProvenance(ctx.db, {
        observationId: input.id,
        userId: ctx.userId,
      });
      return result ?? null;
    }),

  correct: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      valueNumeric: z.number().optional(),
      valueText: z.string().optional(),
      metricCode: z.string().optional(),
      unit: z.string().optional(),
      correctionNote: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...corrections } = input;

      // Read current row
      const [current] = await ctx.db
        .select()
        .from(observations)
        .where(and(eq(observations.id, id), eq(observations.userId, ctx.userId)))
        .limit(1);

      if (!current) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Observation not found' });
      }

      await ctx.db
        .update(observations)
        .set({
          ...(corrections.valueNumeric !== undefined && { valueNumeric: corrections.valueNumeric }),
          ...(corrections.valueText !== undefined && { valueText: corrections.valueText }),
          ...(corrections.metricCode !== undefined && { metricCode: corrections.metricCode }),
          ...(corrections.unit !== undefined && { unit: corrections.unit }),
          originalValueNumeric: current.originalValueNumeric ?? current.valueNumeric,
          originalValueText: current.originalValueText ?? current.valueText,
          originalUnit: current.originalUnit ?? current.unit,
          correctionNote: corrections.correctionNote,
          status: 'corrected',
          updatedAt: new Date(),
        })
        .where(and(eq(observations.id, id), eq(observations.userId, ctx.userId)));

      const changes: Record<string, { from: unknown; to: unknown }> = {};
      if (corrections.valueNumeric !== undefined) {
        changes.valueNumeric = { from: current.valueNumeric, to: corrections.valueNumeric };
      }
      if (corrections.valueText !== undefined) {
        changes.valueText = { from: current.valueText, to: corrections.valueText };
      }
      if (corrections.metricCode !== undefined) {
        changes.metricCode = { from: current.metricCode, to: corrections.metricCode };
      }
      if (corrections.unit !== undefined) {
        changes.unit = { from: current.unit, to: corrections.unit };
      }

      // 化验单区间学习（spec 19 §4）：纠正后的行代表用户认可的数据——
      // metricCode/unit 取纠正后的值，区间取行上的报告原文区间（correct 不改区间列），
      // source 沿用观测行的互认标识（如陕HR），无标识则「检验科区间」。
      await ensureLearnedRange(ctx.db, {
        metricCode: corrections.metricCode ?? current.metricCode,
        unit: corrections.unit ?? current.unit,
        rangeLow: current.referenceRangeLow,
        rangeHigh: current.referenceRangeHigh,
        metadataJson: current.metadataJson,
      });

      emitEvent({
        type: 'observation.corrected',
        payload: {
          observationId: id,
          metricCode: corrections.metricCode ?? current.metricCode,
          changes,
        },
        userId: ctx.userId,
        timestamp: new Date(),
      });

      return { success: true };
    }),

  confirm: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .update(observations)
        .set({ status: 'confirmed', updatedAt: new Date() })
        .where(and(eq(observations.id, input.id), eq(observations.userId, ctx.userId)))
        .returning({
          importJobId: observations.importJobId,
          metricCode: observations.metricCode,
          unit: observations.unit,
          rangeLow: observations.referenceRangeLow,
          rangeHigh: observations.referenceRangeHigh,
          metadataJson: observations.metadataJson,
        });

      if (!result.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Observation not found' });
      }

      // 化验单区间学习（spec 19 §4）：确认 = 用户背书该报告原文区间 → 先查后插学习行
      // source 沿用观测行的互认标识（如陕HR），无标识则「检验科区间」。
      const confirmed = result[0]!;
      await ensureLearnedRange(ctx.db, {
        metricCode: confirmed.metricCode,
        unit: confirmed.unit,
        rangeLow: confirmed.rangeLow,
        rangeHigh: confirmed.rangeHigh,
        metadataJson: confirmed.metadataJson,
      });

      // Do not complete an import while an unmatched item still needs a user decision.
      const jobId = result[0]!.importJobId;
      if (jobId) {
        const pending = await ctx.db
          .select({ id: observations.id })
          .from(observations)
          .where(
            and(
              eq(observations.importJobId, jobId),
              eq(observations.userId, ctx.userId),
              inArray(observations.status, ['extracted', 'flagged']),
            ),
          )
          .limit(1);

        if (pending.length === 0) {
          await ctx.db
            .update(importJobs)
            .set({ status: 'completed', needsReview: false, completedAt: new Date(), updatedAt: new Date() })
            .where(and(eq(importJobs.id, jobId), eq(importJobs.userId, ctx.userId)));
        }
      }

      emitEvent({
        type: 'observation.confirmed',
        payload: { observationId: input.id },
        userId: ctx.userId,
        timestamp: new Date(),
      });

      return { success: true };
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(observations)
        .where(and(eq(observations.id, input.id), eq(observations.userId, ctx.userId)));
      return { success: true };
    }),
});
