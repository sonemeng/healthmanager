import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and, desc } from 'drizzle-orm';
import { createRouter, protectedProcedure } from '../init';
import { conditions } from '@openvitals/database';
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
