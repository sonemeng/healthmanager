import { z } from 'zod';
import { and, eq, desc, inArray } from 'drizzle-orm';
import { createRouter, protectedProcedure } from '../init';
import { listObservations, users, insights, medications, conditions, encounters, aiChannels, observations, metricDefinitions, profiles } from '@openvitals/database';
import { healthChatPrompt, healthReportZhPrompt, formatObservationForContext, buildContextSummary, estimateTokens, resolveModel } from '@openvitals/ai';
import type { ContextBundle } from '@openvitals/ai';
import { generateText } from 'ai';
import { getActiveProfileId } from '../active-profile';

export const aiRouter = createRouter({
  chat: protectedProcedure
    .input(z.object({
      message: z.string().min(1).max(4000),
      categories: z.array(z.string()).optional(),
      dateFrom: z.date().optional(),
      dateTo: z.date().optional(),
      conversationId: z.string().uuid().optional(),
      model: z.string().min(1).max(200).optional(),
      reasoningEffort: z.enum(['low', 'medium', 'high']).default('medium'),
    }))
    .mutation(async ({ ctx, input }) => {
      const conversationId = input.conversationId ?? crypto.randomUUID();
      const profileId = await getActiveProfileId(ctx.userId);
      // Build context from user's observations
      const obs = await listObservations(ctx.db, {
        userId: ctx.userId,
        profileId,
        category: input.categories?.[0],
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        limit: 100,
      });

      // Fetch medications, conditions, and encounters for richer context
      const [meds, conds, encs, profile] = await Promise.all([
        ctx.db.select({ name: medications.name, dosage: medications.dosage, frequency: medications.frequency, isActive: medications.isActive, startDate: medications.startDate, category: medications.category })
          .from(medications).where(and(eq(medications.userId, ctx.userId), ...(profileId ? [eq(medications.profileId, profileId)] : []))).orderBy(desc(medications.createdAt)).limit(20),
        ctx.db.select({ name: conditions.name, severity: conditions.severity, status: conditions.status, onsetDate: conditions.onsetDate })
          .from(conditions).where(and(eq(conditions.userId, ctx.userId), ...(profileId ? [eq(conditions.profileId, profileId)] : []))).limit(20),
        ctx.db.select({ type: encounters.type, provider: encounters.provider, encounterDate: encounters.encounterDate, chiefComplaint: encounters.chiefComplaint, summary: encounters.summary })
          .from(encounters).where(and(eq(encounters.userId, ctx.userId), ...(profileId ? [eq(encounters.profileId, profileId)] : []))).orderBy(desc(encounters.encounterDate)).limit(10),
        profileId ? ctx.db.select({ name: profiles.name, gender: profiles.gender, birthDate: profiles.birthDate, heightCm: profiles.heightCm, weightKg: profiles.weightKg, bloodType: profiles.bloodType, allergies: profiles.allergies, familyHistory: profiles.familyHistory }).from(profiles).where(and(eq(profiles.id, profileId), eq(profiles.userId, ctx.userId))).limit(1) : Promise.resolve([]),
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

      const profileContext = profile[0] ? `\n--- PROFILE ---\n姓名：${profile[0].name}\n性别：${profile[0].gender ?? '未填写'}\n出生日期：${profile[0].birthDate ?? '未填写'}\n身高：${profile[0].heightCm ?? '未填写'} cm\n体重：${profile[0].weightKg ?? '未填写'} kg\n血型：${profile[0].bloodType ?? '未填写'}\n过敏史：${profile[0].allergies ?? '无记录'}\n家族史：${profile[0].familyHistory ?? '无记录'}` : '';
      const contextText = formattedObs.join('\n') + medsContext + condsContext + encsContext + profileContext;

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

      const modelId = input.model ?? user?.aiModel ?? process.env.AI_DEFAULT_MODEL ?? 'claude-sonnet-4-20250514';

      // 启用中的渠道（DB）> 环境变量 > Vercel Gateway
      const [channel] = await ctx.db
        .select({ baseUrl: aiChannels.baseUrl, apiKey: aiChannels.apiKey, protocol: aiChannels.protocol })
        .from(aiChannels)
        .where(and(eq(aiChannels.userId, ctx.userId), eq(aiChannels.isActive, true)))
        .limit(1);

      const useOpenAiReasoning = channel?.protocol === 'openai' && /^(gpt-|o[1-9]|chatgpt-)/i.test(modelId);
      const { text: answer } = await generateText({
        model: resolveModel(modelId, channel
          ? { baseUrl: channel.baseUrl, apiKey: channel.apiKey, protocol: channel.protocol }
          : undefined),
        system: `${healthChatPrompt}\n\n--- USER HEALTH DATA ---\n${bundle.summary}\n${contextText}`,
        prompt: input.message,
        ...(useOpenAiReasoning && {
          providerOptions: { openai: { reasoningEffort: input.reasoningEffort } },
        }),
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
          metadataJson: { conversationId, question: input.message, model: modelId, reasoningEffort: input.reasoningEffort, profileId },
        })
        .returning();

      return {
        answer,
        insightId: insight!.id,
        conversationId,
        bundle: bundle.summary,
      };
    }),

  conversations: protectedProcedure.query(async ({ ctx }) => {
    const profileId = await getActiveProfileId(ctx.userId);
    const rows = await ctx.db
      .select({ id: insights.id, metadataJson: insights.metadataJson, createdAt: insights.createdAt })
      .from(insights)
      .where(and(eq(insights.userId, ctx.userId), eq(insights.type, 'chat_response')))
      .orderBy(desc(insights.createdAt))
      .limit(200);
    const latest = new Map<string, { id: string; title: string; createdAt: Date | null }>();
    for (const row of rows) {
      const metadata = row.metadataJson as Record<string, unknown> | null;
      if (metadata?.profileId !== profileId) continue;
      const id = typeof metadata?.conversationId === 'string' ? metadata.conversationId : null;
      if (id && !latest.has(id)) latest.set(id, { id, title: typeof metadata?.question === 'string' ? metadata.question : '健康咨询', createdAt: row.createdAt });
    }
    return Array.from(latest.values());
  }),

  conversation: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const profileId = await getActiveProfileId(ctx.userId);
      const rows = await ctx.db
        .select({ id: insights.id, content: insights.content, metadataJson: insights.metadataJson })
        .from(insights)
        .where(and(eq(insights.userId, ctx.userId), eq(insights.type, 'chat_response')))
        .orderBy(insights.createdAt)
        .limit(200);
      return rows.flatMap((row) => {
        const metadata = row.metadataJson as Record<string, unknown> | null;
        if (metadata?.profileId !== profileId) return [];
        if (metadata?.conversationId !== input.id || typeof metadata.question !== 'string') return [];
        return [
          { id: `${row.id}-question`, role: 'user' as const, content: metadata.question },
          { id: row.id, role: 'assistant' as const, content: row.content, artifactId: row.id },
        ];
      });
    }),

  healthReport: protectedProcedure
    .mutation(async ({ ctx }) => {
      const profileId = await getActiveProfileId(ctx.userId);
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
        .where(and(eq(observations.userId, ctx.userId), ...(profileId ? [eq(observations.profileId, profileId)] : []), inArray(observations.status, ['extracted', 'confirmed', 'corrected'])))
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
      const [meds, conds, encs, profile] = await Promise.all([
        ctx.db.select({ name: medications.name, dosage: medications.dosage, isActive: medications.isActive })
          .from(medications).where(and(eq(medications.userId, ctx.userId), ...(profileId ? [eq(medications.profileId, profileId)] : []))).limit(30),
        ctx.db.select({ name: conditions.name, status: conditions.status })
          .from(conditions).where(and(eq(conditions.userId, ctx.userId), ...(profileId ? [eq(conditions.profileId, profileId)] : []))).limit(30),
        ctx.db.select({ type: encounters.type, encounterDate: encounters.encounterDate, chiefComplaint: encounters.chiefComplaint })
          .from(encounters).where(and(eq(encounters.userId, ctx.userId), ...(profileId ? [eq(encounters.profileId, profileId)] : []))).orderBy(desc(encounters.encounterDate)).limit(10),
        profileId ? ctx.db.select({ name: profiles.name, gender: profiles.gender, birthDate: profiles.birthDate, heightCm: profiles.heightCm, weightKg: profiles.weightKg, bloodType: profiles.bloodType, allergies: profiles.allergies, familyHistory: profiles.familyHistory }).from(profiles).where(and(eq(profiles.id, profileId), eq(profiles.userId, ctx.userId))).limit(1) : Promise.resolve([]),
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

      const p = profile[0];
      const profileLine = p ? `\n档案资料：${p.name}；性别：${p.gender ?? '未填写'}；出生日期：${p.birthDate ?? '未填写'}；身高：${p.heightCm ?? '未填写'} cm；体重：${p.weightKg ?? '未填写'} kg；血型：${p.bloodType ?? '未填写'}；过敏史：${p.allergies ?? '无记录'}；家族史：${p.familyHistory ?? '无记录'}` : '';
      const userPrompt = `历年检验指标统计：\n${statLines.join('\n')}${medsLine}${condsLine}${encsLine}${profileLine}`;

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
          metadataJson: { profileId },
        })
        .returning();

      return { id: insight!.id, content: text, model: modelId, createdAt: insight!.createdAt };
    }),

  latestHealthReport: protectedProcedure
    .query(async ({ ctx }) => {
      const profileId = await getActiveProfileId(ctx.userId);
      const rows = await ctx.db
        .select()
        .from(insights)
        .where(and(eq(insights.userId, ctx.userId), eq(insights.type, 'health_report')))
        .orderBy(desc(insights.createdAt))
        .limit(100);
      return rows.find((row) => {
        const metadata = row.metadataJson as Record<string, unknown> | null;
        return metadata?.profileId === profileId;
      }) ?? null;
    }),
});
