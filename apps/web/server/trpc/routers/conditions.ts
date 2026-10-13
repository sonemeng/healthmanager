import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and, desc, inArray, count } from 'drizzle-orm';
import { createRouter, protectedProcedure } from '../init';
import {
  conditions,
  observations,
  metricDefinitions,
} from '@openvitals/database';
import {
  metricsForCondition,
  CONDITION_TIMELINE_MIN_OBS,
} from '@openvitals/database/condition-metric-map';
import { getActiveProfileId } from '../active-profile';

export const conditionsRouter = createRouter({
  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(['active', 'resolved']).optional(),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      const where = [eq(conditions.userId, ctx.userId)];
      const pid = await getActiveProfileId(ctx.userId);
      if (pid) where.push(eq(conditions.profileId, pid));
      if (input?.status) {
        where.push(eq(conditions.status, input.status));
      }

    return ctx.db
      .select()
      .from(conditions)
      .where(and(...where))
      .orderBy(desc(conditions.createdAt));
    }),

  // 病程时间线入口门槛数据（spec 20 §6.2 P5）：按映射字典聚合当前档案每条病史的
  // 关注指标与观测次数。计数口径与时间线页 observations.list 一致（不筛 status、
  // 含全部行）；合计 ≥ CONDITION_TIMELINE_MIN_OBS 条才放开「病程时间线」入口。
  timelineGate: protectedProcedure
    .query(async ({ ctx }) => {
      const pid = await getActiveProfileId(ctx.userId);

      const condWhere = [eq(conditions.userId, ctx.userId)];
      if (pid) condWhere.push(eq(conditions.profileId, pid));
      const conds = await ctx.db
        .select({ id: conditions.id, name: conditions.name })
        .from(conditions)
        .where(and(...condWhere));

      // 全部病史映射指标的并集
      const codeSet = new Set<string>();
      for (const c of conds) {
        for (const code of metricsForCondition(c.name)) codeSet.add(code);
      }
      const codes = Array.from(codeSet);
      if (codes.length === 0) {
        return { gates: [], minObs: CONDITION_TIMELINE_MIN_OBS };
      }

      const obsWhere = [
        eq(observations.userId, ctx.userId),
        inArray(observations.metricCode, codes),
      ];
      if (pid) obsWhere.push(eq(observations.profileId, pid));
      const countRows = await ctx.db
        .select({ metricCode: observations.metricCode, n: count() })
        .from(observations)
        .where(and(...obsWhere))
        .groupBy(observations.metricCode);

      const defRows = await ctx.db
        .select({ id: metricDefinitions.id, name: metricDefinitions.name })
        .from(metricDefinitions)
        .where(inArray(metricDefinitions.id, codes));

      const countMap = new Map(
        countRows.map((r) => [r.metricCode, Number(r.n)]),
      );
      const nameMap = new Map(defRows.map((d) => [d.id, d.name]));

      return {
        minObs: CONDITION_TIMELINE_MIN_OBS,
        gates: conds.map((c) => {
          const metrics = metricsForCondition(c.name).map((code) => ({
            code,
            name: nameMap.get(code) ?? code,
            obsCount: countMap.get(code) ?? 0,
          }));
          return {
            conditionId: c.id,
            metrics,
            totalObs: metrics.reduce((sum, m) => sum + m.obsCount, 0),
          };
        }),
      };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [condition] = await ctx.db
        .select()
        .from(conditions)
        .where(and(eq(conditions.id, input.id), eq(conditions.userId, ctx.userId)))
        .limit(1);

      if (!condition) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Condition not found' });
      }

      return condition;
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        code: z.string().max(20).optional(),
        codeSystem: z.string().max(20).optional(),
        severity: z.enum(['mild', 'moderate', 'severe']).optional(),
        status: z.enum(['active', 'resolved']).default('active'),
        onsetDate: z.string().optional(),
        resolutionDate: z.string().optional(),
        diagnosedBy: z.string().max(255).optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [condition] = await ctx.db
        .insert(conditions)
        .values({
          userId: ctx.userId,
          profileId: (await getActiveProfileId(ctx.userId)) ?? null,
          name: input.name,
          code: input.code,
          codeSystem: input.codeSystem,
          severity: input.severity,
          status: input.status,
          onsetDate: input.onsetDate,
          resolutionDate: input.resolutionDate,
          diagnosedBy: input.diagnosedBy,
          notes: input.notes,
        })
        .returning();

      return condition!;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(255).optional(),
        severity: z.enum(['mild', 'moderate', 'severe']).optional(),
        status: z.enum(['active', 'resolved']).optional(),
        onsetDate: z.string().optional(),
        resolutionDate: z.string().optional(),
        diagnosedBy: z.string().max(255).optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;

      const result = await ctx.db
        .update(conditions)
        .set({
          ...(updates.name !== undefined && { name: updates.name }),
          ...(updates.severity !== undefined && { severity: updates.severity }),
          ...(updates.status !== undefined && { status: updates.status }),
          ...(updates.onsetDate !== undefined && { onsetDate: updates.onsetDate }),
          ...(updates.resolutionDate !== undefined && { resolutionDate: updates.resolutionDate }),
          ...(updates.diagnosedBy !== undefined && { diagnosedBy: updates.diagnosedBy }),
          ...(updates.notes !== undefined && { notes: updates.notes }),
          updatedAt: new Date(),
        })
        .where(and(eq(conditions.id, id), eq(conditions.userId, ctx.userId)))
        .returning();

      if (!result.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Condition not found' });
      }

      return result[0]!;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .delete(conditions)
        .where(and(eq(conditions.id, input.id), eq(conditions.userId, ctx.userId)))
        .returning({ id: conditions.id });

      if (!result.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Condition not found' });
      }

      return { success: true };
    }),
});
