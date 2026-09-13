import { z } from 'zod';
import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import crypto from 'crypto';
import { createRouter, protectedProcedure } from '../init';
import { importJobs, medications, conditions, encounters, observations, profiles, users } from '@openvitals/database';
import { getActiveProfileId } from '../active-profile';

const AVATAR_COLORS = [
  '#18a058',
  '#2080f0',
  '#f0a020',
  '#d03050',
  '#722ed1',
  '#13c2c2',
];

export const profilesRouter = createRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, ctx.userId))
      .orderBy(asc(profiles.sortOrder), asc(profiles.createdAt));
  }),

  active: protectedProcedure.query(async ({ ctx }) => {
    const activeId = await getActiveProfileId(ctx.userId);
    const [profile] = await ctx.db
      .select()
      .from(profiles)
      .where(
        activeId
          ? and(eq(profiles.id, activeId), eq(profiles.userId, ctx.userId))
          : eq(profiles.userId, ctx.userId),
      )
      .orderBy(asc(profiles.sortOrder), asc(profiles.createdAt))
      .limit(1);
    return profile ?? null;
  }),

  familySummary: protectedProcedure.query(async ({ ctx }) => {
    // Each aggregate is grouped once for the whole account, avoiding per-profile queries.
    const [allProfiles, account, reports, medicationCounts, conditionCounts, encounterCounts, observationRows] = await Promise.all([
      ctx.db.select().from(profiles).where(eq(profiles.userId, ctx.userId)).orderBy(asc(profiles.sortOrder), asc(profiles.createdAt)),
      ctx.db.select({ dateOfBirth: users.dateOfBirth, biologicalSex: users.biologicalSex, bloodType: users.bloodType }).from(users).where(eq(users.id, ctx.userId)).limit(1),
      ctx.db.select({ profileId: importJobs.profileId, recordCount: count(), latestReportAt: sql<Date | null>`max(${importJobs.createdAt})` }).from(importJobs).where(eq(importJobs.userId, ctx.userId)).groupBy(importJobs.profileId),
      ctx.db.select({ profileId: medications.profileId, recordCount: count(), activeMedicationCount: sql<number>`count(*) filter (where ${medications.isActive} = true)::int` }).from(medications).where(eq(medications.userId, ctx.userId)).groupBy(medications.profileId),
      ctx.db.select({ profileId: conditions.profileId, recordCount: count() }).from(conditions).where(eq(conditions.userId, ctx.userId)).groupBy(conditions.profileId),
      ctx.db.select({ profileId: encounters.profileId, recordCount: count(), latestEncounterAt: sql<Date | null>`max(${encounters.encounterDate})` }).from(encounters).where(eq(encounters.userId, ctx.userId)).groupBy(encounters.profileId),
      ctx.db.select({ profileId: observations.profileId, metricCode: observations.metricCode, observedAt: observations.observedAt, isAbnormal: observations.isAbnormal }).from(observations).where(eq(observations.userId, ctx.userId)).orderBy(desc(observations.observedAt)),
    ]);

    const reportsByProfile = new Map(reports.map((row) => [row.profileId, row]));
    const medicationsByProfile = new Map(medicationCounts.map((row) => [row.profileId, row]));
    const conditionsByProfile = new Map(conditionCounts.map((row) => [row.profileId, row.recordCount]));
    const encountersByProfile = new Map(encounterCounts.map((row) => [row.profileId, row]));
    const latestMetrics = new Map<string, typeof observationRows[number]>();
    const observationCountsByProfile = new Map<string, number>();
    for (const row of observationRows) {
      if (!row.profileId) continue;
      observationCountsByProfile.set(row.profileId, (observationCountsByProfile.get(row.profileId) ?? 0) + 1);
      if (!latestMetrics.has(`${row.profileId}:${row.metricCode}`)) latestMetrics.set(`${row.profileId}:${row.metricCode}`, row);
    }
    const retestsByProfile = new Map<string, number>();
    const now = Date.now();
    for (const row of latestMetrics.values()) {
      const intervalDays = row.isAbnormal ? 90 : 180;
      const dueInDays = intervalDays - Math.floor((now - new Date(row.observedAt).getTime()) / 86_400_000);
      if (dueInDays <= 0 && row.profileId) retestsByProfile.set(row.profileId, (retestsByProfile.get(row.profileId) ?? 0) + 1);
    }

    return allProfiles.map((profile) => {
      // Account-level demographics are a legacy source for the owner only.
      // Family members must never inherit the account owner's empty-field values.
      const owner = account[0];
      const completedFields = [
        profile.gender ?? (profile.isDefault ? owner?.biologicalSex : null),
        profile.birthDate ?? (profile.isDefault ? owner?.dateOfBirth : null),
        profile.heightCm,
        profile.weightKg,
        profile.bloodType ?? (profile.isDefault ? owner?.bloodType : null),
        profile.allergies,
        profile.familyHistory,
      ].filter((value) => value !== null && value !== undefined && value !== '').length;
      return {
        id: profile.id, name: profile.name, isDefault: profile.isDefault, avatarColor: profile.avatarColor,
        latestReportAt: reportsByProfile.get(profile.id)?.latestReportAt ?? null,
        healthRecordCount: (reportsByProfile.get(profile.id)?.recordCount ?? 0) + (observationCountsByProfile.get(profile.id) ?? 0) + (medicationsByProfile.get(profile.id)?.recordCount ?? 0) + (conditionsByProfile.get(profile.id) ?? 0) + (encountersByProfile.get(profile.id)?.recordCount ?? 0),
        pendingRetestCount: retestsByProfile.get(profile.id) ?? 0,
        activeMedicationCount: medicationsByProfile.get(profile.id)?.activeMedicationCount ?? 0,
        latestEncounterAt: encountersByProfile.get(profile.id)?.latestEncounterAt ?? null,
        completeness: Math.round((completedFields / 7) * 100),
      };
    });
  }),

  summary: protectedProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    const ownsProfile = and(eq(profiles.id, input.id), eq(profiles.userId, ctx.userId));
    const [profile] = await ctx.db.select().from(profiles).where(ownsProfile).limit(1);
    if (!profile) throw new Error('档案不存在');
    const [reportCount, observationCount, medicationCount, conditionCount, encounterCount, latestReports] = await Promise.all([
      ctx.db.select({ value: count() }).from(importJobs).where(and(eq(importJobs.userId, ctx.userId), eq(importJobs.profileId, input.id))),
      ctx.db.select({ value: count() }).from(observations).where(and(eq(observations.userId, ctx.userId), eq(observations.profileId, input.id))),
      ctx.db.select({ value: count() }).from(medications).where(and(eq(medications.userId, ctx.userId), eq(medications.profileId, input.id))),
      ctx.db.select({ value: count() }).from(conditions).where(and(eq(conditions.userId, ctx.userId), eq(conditions.profileId, input.id))),
      ctx.db.select({ value: count() }).from(encounters).where(and(eq(encounters.userId, ctx.userId), eq(encounters.profileId, input.id))),
      ctx.db.select({ id: importJobs.id, status: importJobs.status, createdAt: importJobs.createdAt }).from(importJobs).where(and(eq(importJobs.userId, ctx.userId), eq(importJobs.profileId, input.id))).orderBy(desc(importJobs.createdAt)).limit(4),
    ]);
    return { profile, counts: { reports: reportCount[0]?.value ?? 0, observations: observationCount[0]?.value ?? 0, medications: medicationCount[0]?.value ?? 0, conditions: conditionCount[0]?.value ?? 0, encounters: encounterCount[0]?.value ?? 0 }, latestReports };
  }),

  deletionPreview: protectedProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    const [profile] = await ctx.db.select({ isDefault: profiles.isDefault }).from(profiles)
      .where(and(eq(profiles.id, input.id), eq(profiles.userId, ctx.userId))).limit(1);
    if (!profile) throw new Error('档案不存在');
    if (profile.isDefault) throw new Error('本人档案不可删除');
    const [reports, observationCount, medicationCount, conditionCount, encounterCount] = await Promise.all([
      ctx.db.select({ value: count() }).from(importJobs).where(and(eq(importJobs.userId, ctx.userId), eq(importJobs.profileId, input.id))),
      ctx.db.select({ value: count() }).from(observations).where(and(eq(observations.userId, ctx.userId), eq(observations.profileId, input.id))),
      ctx.db.select({ value: count() }).from(medications).where(and(eq(medications.userId, ctx.userId), eq(medications.profileId, input.id))),
      ctx.db.select({ value: count() }).from(conditions).where(and(eq(conditions.userId, ctx.userId), eq(conditions.profileId, input.id))),
      ctx.db.select({ value: count() }).from(encounters).where(and(eq(encounters.userId, ctx.userId), eq(encounters.profileId, input.id))),
    ]);
    return { reports: reports[0]?.value ?? 0, observations: observationCount[0]?.value ?? 0, medications: medicationCount[0]?.value ?? 0, conditions: conditionCount[0]?.value ?? 0, encounters: encounterCount[0]?.value ?? 0 };
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(30),
        gender: z.enum(['male', 'female']).optional(),
        birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        heightCm: z.number().positive().optional(),
        weightKg: z.number().positive().optional(),
        bloodType: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).optional(),
        allergies: z.string().max(2000).optional(),
        emergencyContactName: z.string().max(100).optional(),
        emergencyContactPhone: z.string().max(50).optional(),
        primaryCareProvider: z.string().max(200).optional(),
        familyHistory: z.string().max(4000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db
        .select({ id: profiles.id })
        .from(profiles)
        .where(eq(profiles.userId, ctx.userId));

      const [row] = await ctx.db
        .insert(profiles)
        .values({
          id: crypto.randomUUID(),
          userId: ctx.userId,
          name: input.name,
          gender: input.gender ?? null,
          birthDate: input.birthDate ?? null,
          heightCm: input.heightCm ?? null,
          weightKg: input.weightKg ?? null,
          bloodType: input.bloodType ?? null,
          allergies: input.allergies ?? null,
          emergencyContactName: input.emergencyContactName ?? null,
          emergencyContactPhone: input.emergencyContactPhone ?? null,
          primaryCareProvider: input.primaryCareProvider ?? null,
          familyHistory: input.familyHistory ?? null,
          avatarColor: AVATAR_COLORS[existing.length % AVATAR_COLORS.length]!,
          // Account owners are created by the authentication lifecycle hook.
          // This endpoint only ever creates family-member profiles.
          isDefault: false,
          sortOrder: existing.length,
        })
        .returning();

      return row!;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(30).optional(),
        gender: z.enum(['male', 'female']).optional(),
        birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        heightCm: z.number().positive().optional(),
        weightKg: z.number().positive().optional(),
        bloodType: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).nullable().optional(),
        allergies: z.string().max(2000).nullable().optional(),
        emergencyContactName: z.string().max(100).nullable().optional(),
        emergencyContactPhone: z.string().max(50).nullable().optional(),
        primaryCareProvider: z.string().max(200).nullable().optional(),
        familyHistory: z.string().max(4000).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input;
      // 校验归属防越权
      const [existing] = await ctx.db
        .select({ id: profiles.id, userId: profiles.userId })
        .from(profiles)
        .where(eq(profiles.id, id))
        .limit(1);
      if (!existing || existing.userId !== ctx.userId) {
        throw new Error('档案不存在');
      }

      const update: Record<string, unknown> = { updatedAt: new Date() };
      // 过滤 undefined，只更新传入字段
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) update[k] = v;
      }

      const [row] = await ctx.db
        .update(profiles)
        .set(update)
        .where(eq(profiles.id, id))
        .returning();

      return row!;
    }),

  remove: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      action: z.enum(['transfer', 'delete']),
      transferToProfileId: z.string().uuid().optional(),
      confirmPermanentDeletion: z.literal(true).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select({ id: profiles.id, userId: profiles.userId, isDefault: profiles.isDefault })
        .from(profiles)
        .where(eq(profiles.id, input.id))
        .limit(1);
      if (!row || row.userId !== ctx.userId) {
        throw new Error('档案不存在');
      }
      if (row.isDefault) throw new Error('本人档案不可删除');

      if (input.action === 'transfer') {
        if (!input.transferToProfileId) throw new Error('请选择接收健康数据的档案');
        const [target] = await ctx.db.select({ id: profiles.id }).from(profiles)
          .where(and(eq(profiles.id, input.transferToProfileId), eq(profiles.userId, ctx.userId))).limit(1);
        if (!target || target.id === row.id) throw new Error('请选择其他健康档案接收数据');
        await ctx.db.transaction(async (tx) => {
          const scope = and(eq(importJobs.userId, ctx.userId), eq(importJobs.profileId, row.id));
          await Promise.all([
            tx.update(importJobs).set({ profileId: target.id, updatedAt: new Date() }).where(scope),
            tx.update(observations).set({ profileId: target.id, updatedAt: new Date() }).where(and(eq(observations.userId, ctx.userId), eq(observations.profileId, row.id))),
            tx.update(medications).set({ profileId: target.id, updatedAt: new Date() }).where(and(eq(medications.userId, ctx.userId), eq(medications.profileId, row.id))),
            tx.update(conditions).set({ profileId: target.id, updatedAt: new Date() }).where(and(eq(conditions.userId, ctx.userId), eq(conditions.profileId, row.id))),
            tx.update(encounters).set({ profileId: target.id, updatedAt: new Date() }).where(and(eq(encounters.userId, ctx.userId), eq(encounters.profileId, row.id))),
          ]);
          await tx.delete(profiles).where(eq(profiles.id, row.id));
        });
        return { ok: true, action: 'transfer' as const, targetProfileId: target.id };
      }

      if (!input.confirmPermanentDeletion) throw new Error('请确认永久删除该成员的健康数据');
      await ctx.db.transaction(async (tx) => {
        await Promise.all([
          tx.delete(observations).where(and(eq(observations.userId, ctx.userId), eq(observations.profileId, row.id))),
          tx.delete(medications).where(and(eq(medications.userId, ctx.userId), eq(medications.profileId, row.id))),
          tx.delete(conditions).where(and(eq(conditions.userId, ctx.userId), eq(conditions.profileId, row.id))),
          tx.delete(encounters).where(and(eq(encounters.userId, ctx.userId), eq(encounters.profileId, row.id))),
          tx.delete(importJobs).where(and(eq(importJobs.userId, ctx.userId), eq(importJobs.profileId, row.id))),
        ]);
        await tx.delete(profiles).where(eq(profiles.id, row.id));
      });
      return { ok: true, action: 'delete' as const };
    }),
});
