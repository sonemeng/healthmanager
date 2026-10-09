import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and, inArray, ne, or, isNotNull, asc } from 'drizzle-orm';
import { createRouter, protectedProcedure } from '../init';
import {
  listObservations,
  getObservationTrend,
  getObservationWithProvenance,
  observations,
  importJobs,
  metricDefinitions,
  unitConversions,
} from '@openvitals/database';
import { emitEvent } from '@openvitals/events';
import { getActiveProfileId } from '../active-profile';

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
  compareBatches: protectedProcedure
    .query(async ({ ctx }) => {
      const profileId = await getActiveProfileId(ctx.userId);

      const rows = await ctx.db
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
            eq(observations.userId, ctx.userId),
            ...(profileId
              ? [eq(observations.profileId, profileId)]
              : []),
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

      const conversions = await ctx.db.select().from(unitConversions);

      type Row = (typeof rows)[number];

      // 同一天 = 一次检查；同指标同天多条 → confirmed/corrected 优先于 extracted，
      // 同级取 updatedAt 最新的一条。
      const statusRank = (s: string) =>
        s === 'confirmed' || s === 'corrected' ? 2 : 1;
      const dayKey = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };

      const days = new Map<string, Map<string, Row>>();
      for (const row of rows) {
        const key = dayKey(row.observedAt);
        const byMetric = days.get(key) ?? new Map<string, Row>();
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

      const dateKeys = Array.from(days.keys()).sort(); // 升序（旧 → 新）

      // 换算查找：fromUnit→toUnit，优先指标特定规则，其次全局规则
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
      const findConversion = (from: string, to: string, metricCode: string) => {
        const list = convLookup.get(convKey(from, to));
        if (!list) return null;
        return (
          list.find((c) => c.metricCode === metricCode) ??
          list.find((c) => c.metricCode === null) ??
          null
        );
      };

      // 批次按日期倒序（最新在前），每次 vs 紧邻上一次
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

        const metricCodes = new Set<string>([
          ...cur.keys(),
          ...(prev?.keys() ?? []),
        ]);

        const metrics = Array.from(metricCodes).map((code) => {
          const curRow = cur.get(code) ?? null;
          const prevRow = prev?.get(code) ?? null;
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

        batches.push({ date: curDate, daysSincePrev, metrics });
      }

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
        .returning({ importJobId: observations.importJobId });

      if (!result.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Observation not found' });
      }

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
