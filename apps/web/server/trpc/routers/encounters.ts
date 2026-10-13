import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and, desc, asc } from 'drizzle-orm';
import { createRouter, protectedProcedure } from '../init';
import { encounters, followUpReminders } from '@openvitals/database';
import { getActiveProfileId } from '../active-profile';
import {
  loadEncounter,
  buildEncounterHub,
  buildEncounterComparison,
} from '../../data/encounter-hub';
import { ensureFollowUpReminder } from '../../data/follow-up';

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

const reminderStatuses = ['pending', 'done', 'dismissed'] as const;

// 从就诊行拼出医嘱解析输入文本（spec 20 §5.3：advice + summary）
function adviceTextOf(row: {
  summary: string | null;
  metadataJson: unknown;
}): string {
  const parts: string[] = [];
  if (row.metadataJson && typeof row.metadataJson === 'object') {
    const advice = (row.metadataJson as Record<string, unknown>).advice;
    if (typeof advice === 'string' && advice.trim()) parts.push(advice.trim());
  }
  if (row.summary && row.summary.trim()) parts.push(row.summary.trim());
  return parts.join('\n');
}

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

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const profileId = await getActiveProfileId(ctx.userId);
      return loadEncounter(ctx.db, ctx.userId, profileId, input.id);
    }),

  // 就诊枢纽卡（spec 20 §2）：±7 天检验批次 + 时点用药 + 时点病史。
  // 计算在 server/data/encounter-hub.ts（与 ai.encounterSummary 共用同一口径）。
  hub: protectedProcedure
    .input(z.object({ encounterId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const profileId = await getActiveProfileId(ctx.userId);
      const encounter = await loadEncounter(
        ctx.db,
        ctx.userId,
        profileId,
        input.encounterId,
      );
      return buildEncounterHub(ctx.db, ctx.userId, profileId, encounter);
    }),

  // 就诊前后疗效对比（spec 20 §3，2026-10-13 拍板：不限窗口取最近）。
  comparison: protectedProcedure
    .input(z.object({ encounterId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const profileId = await getActiveProfileId(ctx.userId);
      const encounter = await loadEncounter(
        ctx.db,
        ctx.userId,
        profileId,
        input.encounterId,
      );
      return buildEncounterComparison(
        ctx.db,
        ctx.userId,
        profileId,
        encounter,
      );
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

      // 医嘱复查提醒（spec 20 §5.4）：失败不阻断主流程
      try {
        await ensureFollowUpReminder(ctx.db, {
          userId: ctx.userId,
          profileId: encounter!.profileId,
          encounterId: encounter!.id,
          encounterDate: encounter!.encounterDate,
          adviceText: adviceTextOf(encounter!),
        });
      } catch (err) {
        console.error(
          '[encounters] ensureFollowUpReminder failed:',
          err instanceof Error ? err.message : err,
        );
      }

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

      // 医嘱复查提醒：更新后按新文本重解析（幂等：先删 pending 自动行再插）
      try {
        await ensureFollowUpReminder(ctx.db, {
          userId: ctx.userId,
          profileId: result[0]!.profileId,
          encounterId: result[0]!.id,
          encounterDate: result[0]!.encounterDate,
          adviceText: adviceTextOf(result[0]!),
        });
      } catch (err) {
        console.error(
          '[encounters] ensureFollowUpReminder failed:',
          err instanceof Error ? err.message : err,
        );
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

  // ── 医嘱复查提醒（spec 20 §5，v0.1.16 P4）─────────────────────────────────

  // 单次就诊的提醒列表（枢纽卡展示，含全部状态）
  reminders: protectedProcedure
    .input(z.object({ encounterId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const profileId = await getActiveProfileId(ctx.userId);
      await loadEncounter(ctx.db, ctx.userId, profileId, input.encounterId);

      return ctx.db
        .select()
        .from(followUpReminders)
        .where(
          and(
            eq(followUpReminders.userId, ctx.userId),
            eq(followUpReminders.encounterId, input.encounterId),
          ),
        )
        .orderBy(asc(followUpReminders.dueDate));
    }),

  // 首页合并展示用：当前 profile 的全部 pending 提醒（含就诊信息）
  upcomingReminders: protectedProcedure.query(async ({ ctx }) => {
    const profileId = await getActiveProfileId(ctx.userId);
    if (!profileId) return [];

    return ctx.db
      .select({
        id: followUpReminders.id,
        encounterId: followUpReminders.encounterId,
        dueDate: followUpReminders.dueDate,
        sourceText: followUpReminders.sourceText,
        encounterDate: encounters.encounterDate,
        encounterType: encounters.type,
      })
      .from(followUpReminders)
      .innerJoin(
        encounters,
        eq(followUpReminders.encounterId, encounters.id),
      )
      .where(
        and(
          eq(followUpReminders.userId, ctx.userId),
          eq(followUpReminders.profileId, profileId),
          eq(followUpReminders.status, 'pending'),
        ),
      )
      .orderBy(asc(followUpReminders.dueDate));
  }),

  setReminderStatus: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.enum(reminderStatuses),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .update(followUpReminders)
        .set({ status: input.status, updatedAt: new Date() })
        .where(
          and(
            eq(followUpReminders.id, input.id),
            eq(followUpReminders.userId, ctx.userId),
          ),
        )
        .returning({ id: followUpReminders.id });

      if (!result.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Reminder not found' });
      }

      return { success: true };
    }),

  // 手动补录（spec 20 §5.5）：无明确期限的医嘱由用户补录提醒；intervalDays 为空
  createManualReminder: protectedProcedure
    .input(
      z.object({
        encounterId: z.string().uuid(),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        note: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const profileId = await getActiveProfileId(ctx.userId);
      const encounter = await loadEncounter(
        ctx.db,
        ctx.userId,
        profileId,
        input.encounterId,
      );

      const [reminder] = await ctx.db
        .insert(followUpReminders)
        .values({
          userId: ctx.userId,
          profileId: encounter.profileId,
          encounterId: encounter.id,
          dueDate: input.dueDate,
          sourceText: input.note?.trim() || null,
          intervalDays: null,
          status: 'pending',
        })
        .returning();

      return reminder!;
    }),

  deleteReminder: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .delete(followUpReminders)
        .where(
          and(
            eq(followUpReminders.id, input.id),
            eq(followUpReminders.userId, ctx.userId),
          ),
        )
        .returning({ id: followUpReminders.id });

      if (!result.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Reminder not found' });
      }

      return { success: true };
    }),
});
