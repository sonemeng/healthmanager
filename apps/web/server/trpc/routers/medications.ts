import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createRouter, protectedProcedure } from '../init';
import { listMedications, createMedication, updateMedication, logMedicationAdherence, getAdherenceLogs, medications } from '@openvitals/database';
import { and, eq } from 'drizzle-orm';
import { getActiveProfileId } from '../active-profile';

export const medicationsRouter = createRouter({
  list: protectedProcedure
    .input(z.object({
      isActive: z.boolean().optional(),
      category: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const profileId = await getActiveProfileId(ctx.userId);
      const items = await listMedications(ctx.db, {
        userId: ctx.userId,
        profileId,
        isActive: input.isActive,
        category: input.category,
      });
      return { items };
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      genericName: z.string().optional(),
      category: z.enum(['prescription', 'supplement', 'otc']).default('prescription'),
      dosage: z.string().optional(),
      frequency: z.string().optional(),
      route: z.string().optional(),
      prescriber: z.string().optional(),
      indication: z.string().optional(),
      startDate: z.date().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const profileId = await getActiveProfileId(ctx.userId);
      const row = await createMedication(ctx.db, {
        userId: ctx.userId,
        profileId,
        name: input.name,
        genericName: input.genericName,
        category: input.category,
        dosage: input.dosage,
        frequency: input.frequency,
        route: input.route,
        prescriber: input.prescriber,
        indication: input.indication,
        startDate: input.startDate?.toISOString().split('T')[0],
        notes: input.notes,
      });
      return { id: row.id };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().optional(),
      dosage: z.string().optional(),
      frequency: z.string().optional(),
      isActive: z.boolean().optional(),
      endDate: z.date().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await updateMedication(ctx.db, {
        id: input.id,
        userId: ctx.userId,
        name: input.name,
        dosage: input.dosage,
        frequency: input.frequency,
        isActive: input.isActive,
        endDate: input.endDate?.toISOString().split('T')[0],
        notes: input.notes,
      });
      if (!result) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Medication not found' });
      }
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .delete(medications)
        .where(and(eq(medications.id, input.id), eq(medications.userId, ctx.userId)))
        .returning({ id: medications.id });

      if (!result.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Medication not found' });
      }

      return { success: true };
    }),

  getAdherence: protectedProcedure
    .input(z.object({
      dateFrom: z.string(),
      dateTo: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const logs = await getAdherenceLogs(ctx.db, {
        userId: ctx.userId,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
      });
      return { logs };
    }),

  logAdherence: protectedProcedure
    .input(z.object({
      medicationId: z.string().uuid(),
      logDate: z.date(),
      taken: z.boolean(),
      timeOfDay: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await logMedicationAdherence(ctx.db, {
        userId: ctx.userId,
        medicationId: input.medicationId,
        logDate: input.logDate.toISOString().split('T')[0]!,
        taken: input.taken,
        timeOfDay: input.timeOfDay,
        notes: input.notes,
      });
      return { success: true };
    }),
});
