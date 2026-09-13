import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and, desc, gte, inArray, lte, type SQL } from 'drizzle-orm';
import { createRouter, protectedProcedure, publicProcedure } from '../init';
import { getActiveGrants, sharePolicies, accessGrants, shareTemplates, profiles, medications, conditions, observations as observationsTable } from '@openvitals/database';
import { getActiveProfileId } from '../active-profile';
import { emitEvent } from '@openvitals/events';
import crypto from 'crypto';

function hashSharePassword(password: string, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifySharePassword(password: string, stored: string) {
  const [salt, expected] = stored.split(':');
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

export const sharingRouter = createRouter({
  createPolicy: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      templateId: z.string().optional(),
      categories: z.array(z.string()).min(1),
      accessLevel: z.enum(['view', 'view_download', 'full']).default('view'),
      dateFrom: z.date().optional(),
      dateTo: z.date().optional(),
      expiresAt: z.date().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const profileId = await getActiveProfileId(ctx.userId);
      if (!profileId) throw new TRPCError({ code: 'BAD_REQUEST', message: '请先选择健康档案' });
      const [policy] = await ctx.db
        .insert(sharePolicies)
        .values({
          userId: ctx.userId,
          profileId,
          name: input.name,
          templateId: input.templateId,
          categories: input.categories,
          accessLevel: input.accessLevel,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          expiresAt: input.expiresAt,
        })
        .returning();

      return { policyId: policy!.id };
    }),

  createGrant: protectedProcedure
    .input(z.object({
      policyId: z.string().uuid(),
      recipientEmail: z.string().email().optional(),
      password: z.string().min(8).max(128).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify policy belongs to user
      const [policy] = await ctx.db
        .select()
        .from(sharePolicies)
        .where(and(eq(sharePolicies.id, input.policyId), eq(sharePolicies.userId, ctx.userId)))
        .limit(1);

      if (!policy) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Policy not found' });
      }

      const token = crypto.randomUUID();

      const [grant] = await ctx.db
        .insert(accessGrants)
        .values({
          sharePolicyId: input.policyId,
          recipientEmail: input.recipientEmail,
          token,
          hasPassword: Boolean(input.password),
          passwordHash: input.password ? hashSharePassword(input.password) : null,
        })
        .returning();

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
      const shareUrl = `${baseUrl}/shared/${token}`;

      emitEvent({
        type: 'share.created',
        payload: {
          sharePolicyId: input.policyId,
          grantId: grant!.id,
          recipientEmail: input.recipientEmail,
        },
        userId: ctx.userId,
        timestamp: new Date(),
      });

      return { grantId: grant!.id, token, shareUrl };
    }),

  listGrants: protectedProcedure
    .query(async ({ ctx }) => {
      const profileId = await getActiveProfileId(ctx.userId);
      const items = await getActiveGrants(ctx.db, { userId: ctx.userId, profileId });
      return { items };
    }),

  revokeGrant: protectedProcedure
    .input(z.object({ grantId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Validate ownership via sharePolicies join
      const grant = await ctx.db
        .select({ id: accessGrants.id, policyUserId: sharePolicies.userId })
        .from(accessGrants)
        .innerJoin(sharePolicies, eq(accessGrants.sharePolicyId, sharePolicies.id))
        .where(eq(accessGrants.id, input.grantId))
        .limit(1);

      if (!grant.length || grant[0]!.policyUserId !== ctx.userId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Grant not found' });
      }

      await ctx.db
        .update(accessGrants)
        .set({ isActive: false, revokedAt: new Date(), updatedAt: new Date() })
        .where(eq(accessGrants.id, input.grantId));

      emitEvent({
        type: 'share.revoked',
        payload: { grantId: input.grantId },
        userId: ctx.userId,
        timestamp: new Date(),
      });

      return { success: true };
    }),

  getTemplates: protectedProcedure
    .query(async ({ ctx }) => {
      const templates = await ctx.db
        .select()
        .from(shareTemplates)
        .orderBy(shareTemplates.sortOrder);
      return { templates };
    }),

  // ── Public endpoints for share recipients ─────────────────────────────

  getSharedData: publicProcedure
    .input(z.object({ token: z.string(), password: z.string().max(128).optional() }))
    .query(async ({ ctx, input }) => {
      // Look up grant and policy
      const grantRows = await ctx.db
        .select({
          grantId: accessGrants.id,
          isActive: accessGrants.isActive,
          hasPassword: accessGrants.hasPassword,
          passwordHash: accessGrants.passwordHash,
          accessCount: accessGrants.accessCount,
          policyId: sharePolicies.id,
          policyName: sharePolicies.name,
          policyUserId: sharePolicies.userId,
          profileId: sharePolicies.profileId,
          categories: sharePolicies.categories,
          accessLevel: sharePolicies.accessLevel,
          dateFrom: sharePolicies.dateFrom,
          dateTo: sharePolicies.dateTo,
          expiresAt: sharePolicies.expiresAt,
          policyIsActive: sharePolicies.isActive,
        })
        .from(accessGrants)
        .innerJoin(sharePolicies, eq(accessGrants.sharePolicyId, sharePolicies.id))
        .where(eq(accessGrants.token, input.token))
        .limit(1);

      if (!grantRows.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Share link not found or has been revoked.' });
      }

      const grant = grantRows[0]!;

      if (!grant.isActive || !grant.policyIsActive) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'This share link has been revoked.' });
      }
      if (grant.hasPassword && (!input.password || !grant.passwordHash || !verifySharePassword(input.password, grant.passwordHash))) {
        throw new TRPCError({ code: 'FORBIDDEN', message: '此分享链接需要密码' });
      }

      if (grant.expiresAt && grant.expiresAt < new Date()) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'This share link has expired.' });
      }

       // The share link is permanently scoped to its profile, never to the
       // currently selected profile in a later browser session.
       if (!grant.profileId) throw new TRPCError({ code: 'NOT_FOUND', message: 'This legacy share link is no longer available.' });
       const [sharer] = await ctx.db
         .select({ name: profiles.name })
         .from(profiles)
         .where(and(eq(profiles.id, grant.profileId), eq(profiles.userId, grant.policyUserId)))
        .limit(1);

      const categories = (grant.categories as string[]) ?? [];

      const observationCategories = categories.filter(
        (category) => category !== 'medication' && category !== 'condition',
      );
      const obsWhere: SQL[] = [
         eq(observationsTable.userId, grant.policyUserId),
         eq(observationsTable.profileId, grant.profileId),
      ];
      if (observationCategories.length > 0) {
        obsWhere.push(inArray(observationsTable.category, observationCategories));
      }
      if (grant.dateFrom) {
        obsWhere.push(gte(observationsTable.observedAt, grant.dateFrom));
      }
      if (grant.dateTo) {
        obsWhere.push(lte(observationsTable.observedAt, grant.dateTo));
      }

      const filteredObs = observationCategories.length > 0
        ? await ctx.db
            .select()
            .from(observationsTable)
            .where(and(...obsWhere))
            .orderBy(desc(observationsTable.observedAt))
        : [];

      // For 'view' access level, strip exact values
      const observations = grant.accessLevel === 'view'
        ? filteredObs.map((o) => ({
            metricCode: o.metricCode,
            category: o.category,
            isAbnormal: o.isAbnormal,
            unit: o.unit,
            observedAt: o.observedAt,
            referenceRangeLow: o.referenceRangeLow,
            referenceRangeHigh: o.referenceRangeHigh,
            valueNumeric: null as number | null,
            valueText: null as string | null,
          }))
        : filteredObs.map((o) => ({
            metricCode: o.metricCode,
            category: o.category,
            isAbnormal: o.isAbnormal,
            unit: o.unit,
            observedAt: o.observedAt,
            referenceRangeLow: o.referenceRangeLow,
            referenceRangeHigh: o.referenceRangeHigh,
            valueNumeric: o.valueNumeric,
            valueText: o.valueText,
          }));

      // Fetch medications if in categories
      let sharedMeds: Array<{
        name: string;
        dosage: string | null;
        frequency: string | null;
        isActive: boolean | null;
        startDate: string | null;
      }> = [];
      if (categories.includes('medication') && grant.accessLevel !== 'view') {
        const meds = await ctx.db
          .select({
            name: medications.name,
            dosage: medications.dosage,
            frequency: medications.frequency,
            isActive: medications.isActive,
            startDate: medications.startDate,
          })
          .from(medications)
           .where(and(eq(medications.userId, grant.policyUserId), eq(medications.profileId, grant.profileId)))
          .orderBy(desc(medications.createdAt));
        sharedMeds = meds;
      }

      // Fetch conditions if in categories
      let sharedConditions: Array<{
        name: string;
        severity: string | null;
        status: string | null;
        onsetDate: string | null;
      }> = [];
      if (categories.includes('condition') && grant.accessLevel !== 'view') {
        const conds = await ctx.db
          .select({
            name: conditions.name,
            severity: conditions.severity,
            status: conditions.status,
            onsetDate: conditions.onsetDate,
          })
          .from(conditions)
           .where(and(eq(conditions.userId, grant.policyUserId), eq(conditions.profileId, grant.profileId)))
          .orderBy(desc(conditions.createdAt));
        sharedConditions = conds;
      }

      // Update access tracking
      await ctx.db
        .update(accessGrants)
        .set({
          lastAccessedAt: new Date(),
          accessCount: (grant.accessCount ?? 0) + 1,
          updatedAt: new Date(),
        })
        .where(eq(accessGrants.id, grant.grantId));

      emitEvent({
        type: 'share.accessed',
        payload: { grantId: grant.grantId },
        userId: grant.policyUserId,
        timestamp: new Date(),
      });

      return {
        sharerName: sharer?.name ?? 'Someone',
        policyName: grant.policyName,
        categories,
        accessLevel: grant.accessLevel,
        observations,
        medications: sharedMeds,
        conditions: sharedConditions,
      };
    }),
});
