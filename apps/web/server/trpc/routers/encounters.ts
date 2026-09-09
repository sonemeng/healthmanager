import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and, desc } from 'drizzle-orm';
import { createRouter, protectedProcedure } from '../init';
import { encounters } from '@openvitals/database';
import { getActiveProfileId } from '../active-profile';

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
