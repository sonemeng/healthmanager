import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { createRouter, protectedProcedure } from '../init';
import { metricDefinitions, referenceRanges } from '@openvitals/database';

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
});
