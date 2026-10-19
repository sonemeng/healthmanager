import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { createRouter, protectedProcedure } from '../init';
import { metricDefinitions, referenceRanges, users } from '@openvitals/database';

export const metricsRouter = createRouter({
  list: protectedProcedure
    .input(
      z.object({
        category: z.string().optional(),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      let metrics;
      if (input?.category) {
        metrics = await ctx.db
          .select()
          .from(metricDefinitions)
          .where(eq(metricDefinitions.category, input.category))
          .orderBy(metricDefinitions.sortOrder);
      } else {
        metrics = await ctx.db
          .select()
          .from(metricDefinitions)
          .orderBy(metricDefinitions.sortOrder);
      }

      return metrics.map((m) => ({
        ...m,
        aliases: (m.aliases as string[]) ?? [],
      }));
    }),

  referenceRanges: protectedProcedure
    .input(
      z.object({
        metricCode: z.string().optional(),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      if (input?.metricCode) {
        return ctx.db
          .select()
          .from(referenceRanges)
          .where(eq(referenceRanges.metricCode, input.metricCode));
      }
      return ctx.db.select().from(referenceRanges);
    }),

  /**
   * 认领来源（spec 21 §15.7 S5.2）：把一条「来源待补」条目就地核验。
   *
   * 只写 provenance 四列（citation_kind / citation / verified_at / verified_by），
   * **不动 source_tier** —— tier 是「来源等级」的结论，不是「核没核过」的开关；
   * 归位类（无通行参考区间）的 tier 仍是 unverified，靠 citation_kind='exempt' 区分。
   *
   * 写完 citation_kind 后，R8 的判据（tier=unverified 且 citation/citation_kind 全空）
   * 就不再命中它——待补清单自己变短，不需要另维护一份 md（§15.6 N4/N5）。
   */
  claimCitation: protectedProcedure
    .input(
      z.object({
        target: z.enum(['metric', 'range']),
        /** metric: 指标 id（varchar）；range: 区间 id（serial） */
        id: z.union([z.string().min(1), z.number().int().positive()]),
        citationKind: z.enum(['cited', 'exempt']),
        citation: z.string().trim().min(1, '请填写一句依据').max(2000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // verified_by 是 varchar(100)：优先记用户邮箱（可读、可追），过长截断
      const [me] = await ctx.db
        .select({ email: users.email, name: users.name })
        .from(users)
        .where(eq(users.id, ctx.userId))
        .limit(1);
      const verifiedBy = (me?.email ?? me?.name ?? ctx.userId).slice(0, 100);
      const verifiedAt = new Date();

      const patch = {
        citationKind: input.citationKind,
        citation: input.citation,
        verifiedAt,
        verifiedBy,
      };

      if (input.target === 'metric') {
        const updated = await ctx.db
          .update(metricDefinitions)
          .set(patch)
          .where(eq(metricDefinitions.id, String(input.id)))
          .returning({ id: metricDefinitions.id });
        if (updated.length === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: '指标不存在' });
        }
      } else {
        const rangeId = Number(input.id);
        if (!Number.isInteger(rangeId)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: '区间 id 非法' });
        }
        const updated = await ctx.db
          .update(referenceRanges)
          .set(patch)
          .where(eq(referenceRanges.id, rangeId))
          .returning({ id: referenceRanges.id });
        if (updated.length === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: '区间不存在' });
        }
      }

      return { success: true };
    }),
});
