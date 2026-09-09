import { z } from 'zod';
import { and, asc, eq } from 'drizzle-orm';
import crypto from 'crypto';
import { createRouter, protectedProcedure } from '../init';
import { aiChannels, users } from '@openvitals/database';

function maskKey(key: string): string {
  if (key.length <= 4) return '****';
  return `****${key.slice(-4)}`;
}

export const aiChannelsRouter = createRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select()
      .from(aiChannels)
      .where(eq(aiChannels.userId, ctx.userId))
      .orderBy(asc(aiChannels.sortOrder), asc(aiChannels.createdAt));

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      baseUrl: r.baseUrl,
      protocol: r.protocol,
      isActive: r.isActive,
      sortOrder: r.sortOrder,
      modelsCache: (r.modelsCache as string[] | null) ?? null,
      apiKeyMasked: maskKey(r.apiKey),
      createdAt: r.createdAt,
    }));
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(50),
        baseUrl: z.string().url(),
        apiKey: z.string().min(1),
        protocol: z.enum(['openai', 'anthropic']).default('openai'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db
        .select({ id: aiChannels.id })
        .from(aiChannels)
        .where(eq(aiChannels.userId, ctx.userId));

      const isFirst = existing.length === 0;

      const [row] = await ctx.db
        .insert(aiChannels)
        .values({
          id: crypto.randomUUID(),
          userId: ctx.userId,
          name: input.name,
          baseUrl: input.baseUrl.trim().replace(/\/+$/, ''),
          apiKey: input.apiKey.trim(),
          protocol: input.protocol,
          isActive: isFirst,
          sortOrder: existing.length,
        })
        .returning();

      return { id: row!.id, isActive: row!.isActive };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(50).optional(),
        baseUrl: z.string().url().optional(),
        apiKey: z.string().min(1).optional(),
        protocol: z.enum(['openai', 'anthropic']).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input;
      const update: Record<string, unknown> = { updatedAt: new Date() };
      if (fields.name !== undefined) update.name = fields.name;
      if (fields.baseUrl !== undefined)
        update.baseUrl = fields.baseUrl.trim().replace(/\/+$/, '');
      if (fields.protocol !== undefined) update.protocol = fields.protocol;
      // apiKey 留空 = 不修改
      if (fields.apiKey !== undefined && fields.apiKey.trim() !== '')
        update.apiKey = fields.apiKey.trim();

      await ctx.db
        .update(aiChannels)
        .set(update)
        .where(and(eq(aiChannels.id, id), eq(aiChannels.userId, ctx.userId)));

      return { ok: true };
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(aiChannels)
        .where(and(eq(aiChannels.id, input.id), eq(aiChannels.userId, ctx.userId)));
      return { ok: true };
    }),

  setActive: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // 先全关再开一个
      await ctx.db
        .update(aiChannels)
        .set({ isActive: false })
        .where(eq(aiChannels.userId, ctx.userId));

      const [row] = await ctx.db
        .update(aiChannels)
        .set({ isActive: true, updatedAt: new Date() })
        .where(and(eq(aiChannels.id, input.id), eq(aiChannels.userId, ctx.userId)))
        .returning();

      // 若 users.aiModel 不在新渠道 modelsCache 里，自动切第一个
      if (row) {
        const models = (row.modelsCache as string[] | null) ?? [];
        const [user] = await ctx.db
          .select({ aiModel: users.aiModel })
          .from(users)
          .where(eq(users.id, ctx.userId))
          .limit(1);

        if (user?.aiModel && models.length > 0 && !models.includes(user.aiModel)) {
          await ctx.db
            .update(users)
            .set({ aiModel: models[0]!, updatedAt: new Date() })
            .where(eq(users.id, ctx.userId));
        }
      }

      return { ok: true };
    }),

  fetchModels: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [channel] = await ctx.db
        .select()
        .from(aiChannels)
        .where(and(eq(aiChannels.id, input.id), eq(aiChannels.userId, ctx.userId)))
        .limit(1);

      if (!channel) throw new Error('渠道不存在');

      const base = channel.baseUrl.replace(/\/+$/, '');
      try {
        const res = await fetch(`${base}/models`, {
          headers: { Authorization: `Bearer ${channel.apiKey}` },
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = (await res.json()) as { data?: Array<{ id?: string }> };
        const models = (json.data ?? [])
          .map((m) => m.id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
          .sort();

        await ctx.db
          .update(aiChannels)
          .set({ modelsCache: models, updatedAt: new Date() })
          .where(eq(aiChannels.id, channel.id));

        return { ok: true as const, models };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(
          `拉取模型列表失败：${msg}（确认地址是否以 /v1 结尾且支持 /models 接口）`,
        );
      }
    }),
});
