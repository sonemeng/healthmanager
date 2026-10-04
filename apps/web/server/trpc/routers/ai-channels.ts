import { z } from 'zod';
import { and, asc, eq } from 'drizzle-orm';
import crypto from 'crypto';
import { createRouter, protectedProcedure } from '../init';
import { aiChannels, users } from '@openvitals/database';

function maskKey(key: string): string {
  if (key.length <= 4) return '****';
  return `****${key.slice(-4)}`;
}

// ── 模型列表：候选地址 / 请求头 / 响应解析 ──────────────────────────────────

/** 候选地址：中转站基本都要求 /v1/models，但用户可能只填到域名、或已含 /v1 */
function modelListUrls(baseUrl: string): string[] {
  const base = baseUrl.trim().replace(/\/+$/, '');
  const urls = base.endsWith('/v1') ? [`${base}/models`] : [`${base}/v1/models`, `${base}/models`];
  return [...new Set(urls)];
}

/** Anthropic 原生只认 x-api-key（并要 anthropic-version）；部分中转站两种都收，所以都带上 */
function modelListHeaders(apiKey: string, protocol: string): Record<string, string> {
  if (protocol === 'anthropic')
    return {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      Authorization: `Bearer ${apiKey}`,
    };
  return { Authorization: `Bearer ${apiKey}` };
}

/** 兼容 {data:[{id}]} / {data:["id"]} / {models:[{name|id}]} / 顶层数组 等形态 */
function parseModelIds(json: unknown): string[] {
  const pickId = (v: unknown): string | null => {
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      for (const key of ['id', 'name', 'model']) {
        const cand = o[key];
        if (typeof cand === 'string' && cand.trim()) return cand.trim();
      }
    }
    return null;
  };
  const arr = Array.isArray(json)
    ? json
    : Object.values((json ?? {}) as Record<string, unknown>).find((v) => Array.isArray(v));
  if (!Array.isArray(arr)) return [];
  const ids = arr.map(pickId).filter((x): x is string => Boolean(x));
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
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

      const urls = modelListUrls(channel.baseUrl);
      const headers = modelListHeaders(channel.apiKey, channel.protocol);
      const failures: string[] = [];
      let models: string[] = [];

      for (const url of urls) {
        try {
          const res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
          const text = await res.text();
          if (!res.ok) {
            failures.push(`${url} → HTTP ${res.status} ${text.slice(0, 100).replace(/\s+/g, ' ')}`);
            continue;
          }
          let parsed: unknown = null;
          try {
            parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
          } catch {
            failures.push(`${url} → 响应不是 JSON`);
            continue;
          }
          const ids = parseModelIds(parsed);
          if (ids.length === 0) {
            failures.push(`${url} → 响应里没有模型 id`);
            continue;
          }
          models = ids;
          break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          failures.push(`${url} → ${msg}`);
        }
      }

      if (models.length === 0)
        throw new Error(
          `拉取模型列表失败：${failures.join('；')}。（中转站一般把 BaseURL 填成 https://host/v1；也可以直接在「手动添加模型」里输入模型名）`,
        );

      await ctx.db
        .update(aiChannels)
        .set({ modelsCache: models, updatedAt: new Date() })
        .where(eq(aiChannels.id, channel.id));

      return { ok: true as const, models };
    }),

  /** 手动往该渠道的模型列表里加一个（默认同时设为默认模型）—— 拉不到列表时的兜底 */
  addModel: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        model: z.string().min(1).max(100),
        makeDefault: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const model = input.model.trim();
      if (!model) throw new Error('模型名不能为空');

      const [channel] = await ctx.db
        .select()
        .from(aiChannels)
        .where(and(eq(aiChannels.id, input.id), eq(aiChannels.userId, ctx.userId)))
        .limit(1);
      if (!channel) throw new Error('渠道不存在');

      const current = (channel.modelsCache as string[] | null) ?? [];
      const models = current.includes(model)
        ? current
        : [...current, model].sort((a, b) => a.localeCompare(b));

      await ctx.db
        .update(aiChannels)
        .set({ modelsCache: models, updatedAt: new Date() })
        .where(eq(aiChannels.id, channel.id));

      if (input.makeDefault !== false)
        await ctx.db
          .update(users)
          .set({ aiModel: model, updatedAt: new Date() })
          .where(eq(users.id, ctx.userId));

      return { ok: true as const, models };
    }),

  /** 从该渠道的模型列表里移除一个；若它正被用作默认模型，则切到列表第一个 */
  removeModel: protectedProcedure
    .input(z.object({ id: z.string().uuid(), model: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [channel] = await ctx.db
        .select()
        .from(aiChannels)
        .where(and(eq(aiChannels.id, input.id), eq(aiChannels.userId, ctx.userId)))
        .limit(1);
      if (!channel) throw new Error('渠道不存在');

      const current = (channel.modelsCache as string[] | null) ?? [];
      const models = current.filter((m) => m !== input.model);

      await ctx.db
        .update(aiChannels)
        .set({ modelsCache: models, updatedAt: new Date() })
        .where(eq(aiChannels.id, channel.id));

      const [user] = await ctx.db
        .select({ aiModel: users.aiModel })
        .from(users)
        .where(eq(users.id, ctx.userId))
        .limit(1);
      if (user?.aiModel === input.model)
        await ctx.db
          .update(users)
          .set({ aiModel: models[0] ?? null, updatedAt: new Date() })
          .where(eq(users.id, ctx.userId));

      return { ok: true as const, models };
    }),
});
