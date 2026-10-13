import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and, desc, lte, gte, or, isNull } from 'drizzle-orm';
import { createRouter, protectedProcedure } from '../init';
import { encounters, medications, conditions } from '@openvitals/database';
import { getActiveProfileId } from '../active-profile';
import {
  fetchBatchRows,
  fetchConversions,
  groupRowsByDay,
  compareTwoDays,
  dayKeyOf,
  type BatchMetricRow,
} from '../../data/batch-compare';

const encounterTypes = [
  'checkup',
  'specialist',
  'urgent_care',
  'emergency',
  'telehealth',
  'lab_visit',
  'imaging',
  'dental',
  'therapy',
  'other',
] as const;

// 日期字符串（YYYY-MM-DD）加减天数 → dayKey
function addDaysKey(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setDate(d.getDate() + days);
  return dayKeyOf(d);
}

function gapDays(fromKey: string, toKey: string): number {
  return Math.round(
    (new Date(`${toKey}T00:00:00`).getTime() -
      new Date(`${fromKey}T00:00:00`).getTime()) /
      86_400_000,
  );
}

export const encountersRouter = createRouter({
  list: protectedProcedure
    .input(
      z.object({
        type: z.string().optional(),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      const where = [eq(encounters.userId, ctx.userId)];
      const pid = await getActiveProfileId(ctx.userId);
      if (pid) where.push(eq(encounters.profileId, pid));
      if (input?.type) {
        where.push(eq(encounters.type, input.type));
      }

      return ctx.db
        .select()
        .from(encounters)
        .where(and(...where))
        .orderBy(desc(encounters.encounterDate));
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [encounter] = await ctx.db
        .select()
        .from(encounters)
        .where(and(eq(encounters.id, input.id), eq(encounters.userId, ctx.userId)))
        .limit(1);

      if (!encounter) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Encounter not found' });
      }

      return encounter;
    }),

  // 就诊枢纽卡（spec 20 §2）：一次查询聚合就诊日 D 的三段挂载——
  // ① 检验批次：observedAt 落在 [D-7, D+7] 的观测按日分组（口径与趋势对比页一致）；
  // ② 当时在用药：起止区间覆盖就诊日（起止未填视为长期在用，前端标「起止未填」）；
  // ③ 相关病史：就诊时点处于「患病中」（active 且就诊前起病，或已愈但就诊时尚未愈）。
  hub: protectedProcedure
    .input(z.object({ encounterId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const profileId = await getActiveProfileId(ctx.userId);

      const [encounter] = await ctx.db
        .select()
        .from(encounters)
        .where(
          and(
            eq(encounters.id, input.encounterId),
            eq(encounters.userId, ctx.userId),
            ...(profileId ? [eq(encounters.profileId, profileId)] : []),
          ),
        )
        .limit(1);

      if (!encounter) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Encounter not found' });
      }

      const D = encounter.encounterDate;
      const winStartKey = addDaysKey(D, -7);
      const winEndKey = addDaysKey(D, 7);

      const [rows, conversions] = await Promise.all([
        fetchBatchRows(ctx.db, ctx.userId, profileId),
        fetchConversions(ctx.db),
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

      const medsAtVisit = await ctx.db
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
            eq(medications.userId, ctx.userId),
            ...(profileId ? [eq(medications.profileId, profileId)] : []),
            or(isNull(medications.startDate), lte(medications.startDate, D)),
            or(isNull(medications.endDate), gte(medications.endDate, D)),
          ),
        )
        .orderBy(medications.name);

      const conditionsAtVisit = await ctx.db
        .select({
          id: conditions.id,
          name: conditions.name,
          status: conditions.status,
          onsetDate: conditions.onsetDate,
        })
        .from(conditions)
        .where(
          and(
            eq(conditions.userId, ctx.userId),
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
    }),

  // 就诊前后疗效对比（spec 20 §3，2026-10-13 拍板：不限窗口取最近）：
  // before = 观测日期 ≤ D 的最近批次；after = > D 的最近批次。
  // 对齐口径与趋势对比页同一来源（batch-compare.ts），after 视角 presence/delta。
  comparison: protectedProcedure
    .input(z.object({ encounterId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const profileId = await getActiveProfileId(ctx.userId);

      const [encounter] = await ctx.db
        .select()
        .from(encounters)
        .where(
          and(
            eq(encounters.id, input.encounterId),
            eq(encounters.userId, ctx.userId),
            ...(profileId ? [eq(encounters.profileId, profileId)] : []),
          ),
        )
        .limit(1);

      if (!encounter) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Encounter not found' });
      }

      const D = encounter.encounterDate;

      const [rows, conversions] = await Promise.all([
        fetchBatchRows(ctx.db, ctx.userId, profileId),
        fetchConversions(ctx.db),
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
    }),

  create: protectedProcedure
    .input(
      z.object({
        type: z.enum(encounterTypes),
        provider: z.string().max(255).optional(),
        facility: z.string().max(255).optional(),
        encounterDate: z.string(),
        chiefComplaint: z.string().optional(),
        summary: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [encounter] = await ctx.db
        .insert(encounters)
        .values({
          userId: ctx.userId,
          profileId: (await getActiveProfileId(ctx.userId)) ?? null,
          type: input.type,
          provider: input.provider,
          facility: input.facility,
          encounterDate: input.encounterDate,
          chiefComplaint: input.chiefComplaint,
          summary: input.summary,
        })
        .returning();

      return encounter!;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        type: z.enum(encounterTypes).optional(),
        provider: z.string().max(255).optional(),
        facility: z.string().max(255).optional(),
        encounterDate: z.string().optional(),
        chiefComplaint: z.string().optional(),
        summary: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;

      const result = await ctx.db
        .update(encounters)
        .set({
          ...(updates.type !== undefined && { type: updates.type }),
          ...(updates.provider !== undefined && { provider: updates.provider }),
          ...(updates.facility !== undefined && { facility: updates.facility }),
          ...(updates.encounterDate !== undefined && { encounterDate: updates.encounterDate }),
          ...(updates.chiefComplaint !== undefined && { chiefComplaint: updates.chiefComplaint }),
          ...(updates.summary !== undefined && { summary: updates.summary }),
          updatedAt: new Date(),
        })
        .where(and(eq(encounters.id, id), eq(encounters.userId, ctx.userId)))
        .returning();

      if (!result.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Encounter not found' });
      }

      return result[0]!;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .delete(encounters)
        .where(and(eq(encounters.id, input.id), eq(encounters.userId, ctx.userId)))
        .returning({ id: encounters.id });

      if (!result.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Encounter not found' });
      }

      return { success: true };
    }),
});
