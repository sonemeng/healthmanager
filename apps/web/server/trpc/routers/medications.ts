import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createRouter, protectedProcedure } from '../init';
import { listMedications, createMedication, updateMedication, recordMedicationChange, logMedicationAdherence, getAdherenceLogs, medications } from '@openvitals/database';
import { and, eq } from 'drizzle-orm';
import { getActiveProfileId } from '../active-profile';

// 空字符串 → null（清空字段）；undefined → 不修改
function clearable(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return value.trim() || null;
}

function dateOrNull(value: Date | null | undefined): string | null | undefined {
  if (value == null) return value;
  return value.toISOString().split('T')[0];
}

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
      name: z.string().min(1).max(255).optional(),
      category: z.enum(['prescription', 'supplement', 'otc']).optional(),
      dosage: z.string().optional(),
      frequency: z.string().optional(),
      route: z.string().optional(),
      prescriber: z.string().optional(),
      indication: z.string().optional(),
      startDate: z.date().nullable().optional(),
      isActive: z.boolean().optional(),
      endDate: z.date().nullable().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await updateMedication(ctx.db, {
        id: input.id,
        userId: ctx.userId,
        name: input.name,
        category: input.category,
        dosage: clearable(input.dosage),
        frequency: clearable(input.frequency),
        route: clearable(input.route),
        prescriber: clearable(input.prescriber),
        indication: clearable(input.indication),
        startDate: dateOrNull(input.startDate),
        isActive: input.isActive,
        endDate: dateOrNull(input.endDate),
        notes: clearable(input.notes),
      });
      if (!result) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Medication not found' });
      }
      return { success: true };
    }),

  // 用药变化：旧段自动停用（end_date=changeDate），新开一段保留历史
  recordChange: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      dosage: z.string().optional(),
      frequency: z.string().optional(),
      indication: z.string().optional(),
      notes: z.string().optional(),
      changeDate: z.date(),
    }))
    .mutation(async ({ ctx, input }) => {
      const row = await recordMedicationChange(ctx.db, {
        id: input.id,
        userId: ctx.userId,
        dosage: clearable(input.dosage),
        frequency: clearable(input.frequency),
        indication: clearable(input.indication),
        notes: clearable(input.notes),
        changeDate: input.changeDate.toISOString().split('T')[0]!,
      });
      if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Medication not found' });
      }
      return { id: row.id };
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
