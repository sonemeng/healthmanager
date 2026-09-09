import { z } from 'zod';
import { createRouter, protectedProcedure } from '../init';
import { feedback } from '@openvitals/database';

export const feedbackRouter = createRouter({
  create: protectedProcedure
    .input(z.object({
      message: z.string().min(1).max(2000),
      rating: z.enum(['TERRIBLE', 'BAD', 'OKAY', 'GOOD', 'AMAZING']).nullable().optional(),
      page: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.insert(feedback).values({
        userId: ctx.userId,
        message: input.message,
        rating: input.rating ?? null,
        page: input.page,
      });

      return { success: true };
    }),
});
