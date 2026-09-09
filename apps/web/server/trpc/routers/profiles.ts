import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import crypto from 'crypto';
import { createRouter, protectedProcedure } from '../init';
import { profiles } from '@openvitals/database';

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

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(30),
        gender: z.enum(['male', 'female']).optional(),
        birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        heightCm: z.number().positive().optional(),
        weightKg: z.number().positive().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db
        .select({ id: profiles.id })
        .from(profiles)
        .where(eq(profiles.userId, ctx.userId));

      const isFirst = existing.length === 0;

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
          avatarColor: AVATAR_COLORS[existing.length % AVATAR_COLORS.length]!,
          isDefault: isFirst,
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
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // 校验归属防越权；仅删档案，业务数据 profile_id 置空（ON DELETE SET NULL），健康数据保留
      const [row] = await ctx.db
        .select({ id: profiles.id, userId: profiles.userId })
        .from(profiles)
        .where(eq(profiles.id, input.id))
        .limit(1);
      if (!row || row.userId !== ctx.userId) {
        throw new Error('档案不存在');
      }
      await ctx.db.delete(profiles).where(eq(profiles.id, input.id));
      return { ok: true };
    }),
});
