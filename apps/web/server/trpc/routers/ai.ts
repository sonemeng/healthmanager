import { z } from 'zod';
import { and, eq, desc, inArray } from 'drizzle-orm';
import { createRouter, protectedProcedure } from '../init';
import { listObservations, users, insights, medications, conditions, encounters, aiChannels, observations, metricDefinitions } from '@openvitals/database';
import { healthChatPrompt, healthReportZhPrompt, formatObservationForContext, buildContextSummary, estimateTokens, resolveModel } from '@openvitals/ai';
import type { ContextBundle } from '@openvitals/ai';
import { generateText } from 'ai';

export const aiRouter = createRouter({
  chat: protectedProcedure
    .input(z.object({
      message: z.string().min(1).max(4000),
      categories: z.array(z.string()).optional(),
      dateFrom: z.date().optional(),
      dateTo: z.date().optional(),
      conversationId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Build context from user's observations
      const obs = await listObservations(ctx.db, {
        userId: ctx.userId,
        category: input.categories?.[0],
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        limit: 100,
      });

      // Fetch medications, conditions, and encounters for richer context
      const [meds, conds, encs] = await Promise.all([
        ctx.db.select({ name: medications.name, dosage: medications.dosage, frequency: medications.frequency, isActive: medications.isActive, startDate: medications.startDate, category: medications.category })
          .from(medications).where(eq(medications.userId, ctx.userId)).orderBy(desc(medications.createdAt)).limit(20),
        ctx.db.select({ name: conditions.name, severity: conditions.severity, status: conditions.status, onsetDate: conditions.onsetDate })
          .from(conditions).where(eq(conditions.userId, ctx.userId)).limit(20),
        ctx.db.select({ type: encounters.type, provider: encounters.provider, encounterDate: encounters.encounterDate, chiefComplaint: encounters.chiefComplaint, summary: encounters.summary })
          .from(encounters).where(eq(encounters.userId, ctx.userId)).orderBy(desc(encounters.encounterDate)).limit(10),
      ]);

      const formattedObs = obs.map(formatObservationForContext);

      // Build medication context
      const medsContext = meds.length > 0
        ? '\n--- MEDICATIONS ---\n' + meds.map((m) =>
            `${m.name}${m.dosage ? ` ${m.dosage}` : ''}${m.frequency ? ` (${m.frequency})` : ''} - ${m.isActive ? 'Active' : 'Discontinued'}${m.startDate ? ` since ${m.startDate}` : ''}`
          ).join('\n')
        : '';

      // Build conditions context
      const condsContext = conds.length > 0
        ? '\n--- CONDITIONS ---\n' + conds.map((c) =>
            `${c.name}${c.severity ? ` (${c.severity})` : ''} - ${c.status ?? 'active'}${c.onsetDate ? ` since ${c.onsetDate}` : ''}`
          ).join('\n')
        : '';

      // Build encounters context
      const encsContext = encs.length > 0
        ? '\n--- RECENT ENCOUNTERS ---\n' + encs.map((e) =>
            `${e.type.replace(/_/g, ' ')} on ${e.encounterDate}${e.provider ? ` with ${e.provider}` : ''}${e.chiefComplaint ? `: ${e.chiefComplaint}` : ''}${e.summary ? ` — ${e.summary}` : ''}`
          ).join('\n')
        : '';

      const contextText = formattedObs.join('\n') + medsContext + condsContext + encsContext;

      const bundle: ContextBundle = {
        sections: (input.categories ?? ['general']).map((cat) => ({
          category: cat as any,
          content: contextText,
          observationIds: obs.map((o) => o.id),
          tokenEstimate: estimateTokens(contextText),
        })),
        totalTokenEstimate: estimateTokens(contextText),
        observationCount: obs.length,
        sourceObservationIds: obs.map((o) => o.id),
        categories: (input.categories ?? []) as any[],
        assembledAt: new Date(),
        summary: '',
      };

      bundle.summary = buildContextSummary(bundle);

      // Get user's preferred AI model
      const [user] = await ctx.db
        .select({ aiModel: users.aiModel })
        .from(users)
        .where(eq(users.id, ctx.userId))
        .limit(1);

      const modelId = user?.aiModel ?? process.env.AI_DEFAULT_MODEL ?? 'claude-sonnet-4-20250514';

      // 启用中的渠道（DB）> 环境变量 > Vercel Gateway
      const [channel] = await ctx.db
        .select({ baseUrl: aiChannels.baseUrl, apiKey: aiChannels.apiKey, protocol: aiChannels.protocol })
        .from(aiChannels)
        .where(and(eq(aiChannels.userId, ctx.userId), eq(aiChannels.isActive, true)))
        .limit(1);

      const { text: answer } = await generateText({
        model: resolveModel(modelId, channel
          ? { baseUrl: channel.baseUrl, apiKey: channel.apiKey, protocol: channel.protocol }
          : undefined),
        system: `${healthChatPrompt}\n\n--- USER HEALTH DATA ---\n${bundle.summary}\n${contextText}`,
        prompt: input.message,
      });

      // Store insight
      const [insight] = await ctx.db
        .insert(insights)
        .values({
          userId: ctx.userId,
          type: 'chat_response',
          content: answer,
          generatedBy: modelId,
          sourceObservationIds: bundle.sourceObservationIds,
          sourceCategories: bundle.categories,
          contextTokenCount: bundle.totalTokenEstimate,
        })
        .returning();

      return {
        answer,
        insightId: insight!.id,
        bundle: bundle.summary,
      };
    }),

  healthReport: protectedProcedure
    .mutation(async ({ ctx }) => {
      // 1. 查有效观测（含 flagged 之外的 extracted/confirmed/corrected）
      const rows = await ctx.db
        .select({
          metricCode: observations.metricCode,
          valueNumeric: observations.valueNumeric,
          unit: observations.unit,
          isAbnormal: observations.isAbnormal,
          observedAt: observations.observedAt,
        })
        .from(observations)
        .where(and(eq(observations.userId, ctx.userId), inArray(observations.status, ['extracted', 'confirmed', 'corrected'])))
        .orderBy(observations.observedAt);

      if (rows.length === 0) {
        throw new Error('还没有任何检验数据，请先上传体检报告');
      }

      // 2. 指标中文名映射
      const defs = await ctx.db
        .select({ id: metricDefinitions.id, name: metricDefinitions.name })
        .from(metricDefinitions);
      const nameMap = new Map(defs.map((d) => [d.id, d.name]));

      // 3. JS 内存按 metricCode 聚合
      type Agg = { count: number; first: { v: number | null; at: Date } | null; last: { v: number | null; at: Date } | null; abnormal: number };
      const agg = new Map<string, Agg>();
      for (const r of rows) {
        let a = agg.get(r.metricCode);
        if (!a) {
          a = { count: 0, first: null, last: null, abnormal: 0 };
          agg.set(r.metricCode, a);
        }
        a.count++;
        const entry = { v: r.valueNumeric, at: r.observedAt };
        if (!a.first) a.first = entry;
        a.last = entry;
        if (r.isAbnormal === true) a.abnormal++;
      }

      // 4. 生成中文统计行
      const statLines: string[] = [];
      for (const [code, a] of agg) {
        const name = nameMap.get(code) ?? code;
        const fmt = (d: Date) => d.toISOString().slice(0, 10);
        const first = a.first ? `${a.first.v ?? '?'} (${fmt(a.first.at)})` : '?';
        const last = a.last ? `${a.last.v ?? '?'} ${rows.find((r) => r.metricCode === code)?.unit ?? ''} (${fmt(a.last.at)})` : '?';
        statLines.push(`- ${name}：共 ${a.count} 次，首次 ${first} → 最新 ${last}，异常 ${a.abnormal} 次`);
      }

      // 5. meds/conds/encs 上下文
      const [meds, conds, encs] = await Promise.all([
        ctx.db.select({ name: medications.name, dosage: medications.dosage, isActive: medications.isActive })
          .from(medications).where(eq(medications.userId, ctx.userId)).limit(30),
        ctx.db.select({ name: conditions.name, status: conditions.status })
          .from(conditions).where(eq(conditions.userId, ctx.userId)).limit(30),
        ctx.db.select({ type: encounters.type, encounterDate: encounters.encounterDate, chiefComplaint: encounters.chiefComplaint })
          .from(encounters).where(eq(encounters.userId, ctx.userId)).orderBy(desc(encounters.encounterDate)).limit(10),
      ]);

      const medsLine = meds.length > 0
        ? '\n当前用药：\n' + meds.map((m) => `- ${m.name}${m.dosage ? ` ${m.dosage}` : ''}（${m.isActive ? '在用' : '已停用'}）`).join('\n')
        : '\n当前用药：无记录';
      const condsLine = conds.length > 0
        ? '\n病史：\n' + conds.map((c) => `- ${c.name}（${c.status ?? 'active'}）`).join('\n')
        : '\n病史：无记录';
      const encsLine = encs.length > 0
        ? '\n近期就诊：\n' + encs.map((e) => `- ${e.encounterDate} ${e.type}${e.chiefComplaint ? `：${e.chiefComplaint}` : ''}`).join('\n')
        : '';

      const userPrompt = `历年检验指标统计：\n${statLines.join('\n')}${medsLine}${condsLine}${encsLine}`;

      // 6. resolveModel（用户渠道）
      const [user] = await ctx.db
        .select({ aiModel: users.aiModel })
        .from(users)
        .where(eq(users.id, ctx.userId))
        .limit(1);
      const modelId = user?.aiModel ?? process.env.AI_DEFAULT_MODEL ?? 'claude-sonnet-4-20250514';
      const [channel] = await ctx.db
        .select({ baseUrl: aiChannels.baseUrl, apiKey: aiChannels.apiKey, protocol: aiChannels.protocol })
        .from(aiChannels)
        .where(and(eq(aiChannels.userId, ctx.userId), eq(aiChannels.isActive, true)))
        .limit(1);

      const { text } = await generateText({
        model: resolveModel(modelId, channel
          ? { baseUrl: channel.baseUrl, apiKey: channel.apiKey, protocol: channel.protocol }
          : undefined),
        system: healthReportZhPrompt,
        prompt: userPrompt,
      });

      // 7. 存 insights
      const [insight] = await ctx.db
        .insert(insights)
        .values({
          userId: ctx.userId,
          type: 'health_report',
          content: text,
          generatedBy: modelId,
          sourceCategories: Array.from(agg.keys()),
          contextTokenCount: estimateTokens(userPrompt),
        })
        .returning();

      return { id: insight!.id, content: text, model: modelId, createdAt: insight!.createdAt };
    }),

  latestHealthReport: protectedProcedure
    .query(async ({ ctx }) => {
      const [row] = await ctx.db
        .select()
        .from(insights)
        .where(and(eq(insights.userId, ctx.userId), eq(insights.type, 'health_report')))
        .orderBy(desc(insights.createdAt))
        .limit(1);
      return row ?? null;
    }),
});
