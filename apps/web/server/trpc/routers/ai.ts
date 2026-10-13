import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, eq, desc, inArray } from 'drizzle-orm';
import { createRouter, protectedProcedure } from '../init';
import { listObservations, users, insights, medications, conditions, encounters, aiChannels, observations, metricDefinitions, profiles } from '@openvitals/database';
import { healthChatPrompt, healthReportZhPrompt, formatObservationForContext, buildContextSummary, estimateTokens, resolveModel } from '@openvitals/ai';
import type { ContextBundle } from '@openvitals/ai';
import { generateText } from 'ai';
import { getActiveProfileId } from '../active-profile';
import { encounterSummaryZhPrompt } from '@openvitals/ai/prompts/encounter-summary-zh';
import { loadEncounter, buildEncounterHub, buildEncounterComparison } from '../../data/encounter-hub';

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

  // P3 AI 就诊摘要（spec 20 §4）：单次就诊摘要，复用枢纽卡/前后对比同源数据
  encounterSummary: protectedProcedure
    .input(z.object({ encounterId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const profileId = await getActiveProfileId(ctx.userId);

      // 1. AI 渠道前置检查（验收断言 3：无渠道明确报错，不静默兜底）
      const [channel] = await ctx.db
        .select({ baseUrl: aiChannels.baseUrl, apiKey: aiChannels.apiKey, protocol: aiChannels.protocol })
        .from(aiChannels)
        .where(and(eq(aiChannels.userId, ctx.userId), eq(aiChannels.isActive, true)))
        .limit(1);
      const hasEnvChannel = Boolean(process.env.AI_BASE_URL && process.env.AI_API_KEY);
      if (!channel && !hasEnvChannel) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '请先在设置中配置 AI 渠道' });
      }

      // 2. 同源数据：就诊 + 枢纽（±7 天批次/时点用药/时点病史）+ 前后对比
      const encounter = await loadEncounter(ctx.db, ctx.userId, profileId, input.encounterId);
      const [hub, comparison] = await Promise.all([
        buildEncounterHub(ctx.db, ctx.userId, profileId, encounter),
        buildEncounterComparison(ctx.db, ctx.userId, profileId, encounter),
      ]);

      // 3. 病历四节（与 encounterMetaSections 同键）
      const meta = (encounter.metadataJson ?? {}) as Record<string, unknown>;
      const metaSection = (key: string) =>
        typeof meta[key] === 'string' && (meta[key] as string).trim() ? (meta[key] as string).trim() : null;

      const typeLabels: Record<string, string> = {
        checkup: '体检', specialist: '专科门诊', urgent_care: '急诊护理', emergency: '急诊',
        telehealth: '远程医疗', lab_visit: '化验检查', imaging: '影像检查',
        dental: '牙科', therapy: '治疗门诊', other: '其他',
      };
      const typeLabel = typeLabels[encounter.type] ?? encounter.type;

      // 4. 组中文上下文
      const lines: string[] = [];
      lines.push(`就诊信息：`);
      lines.push(`- 日期：${encounter.encounterDate}；类型：${typeLabel}${encounter.provider ? `；医生：${encounter.provider}` : ''}${encounter.facility ? `；机构：${encounter.facility}` : ''}`);
      if (encounter.chiefComplaint) lines.push(`- 主诉：${encounter.chiefComplaint}`);
      if (encounter.summary) lines.push(`- 就诊摘要：${encounter.summary}`);
      const sectionLabels: Array<[string, string]> = [
        ['presentIllness', '现病史'], ['pastHistory', '既往史'], ['physicalExam', '体格检查'], ['advice', '医嘱建议'],
      ];
      for (const [key, label] of sectionLabels) {
        const v = metaSection(key);
        if (v) lines.push(`- ${label}：${v}`);
      }

      lines.push('');
      if (hub.batches.length > 0) {
        lines.push(`就诊前后 7 天内的检验批次：`);
        for (const batch of hub.batches) {
          lines.push(`批次 ${batch.date}（共 ${batch.total} 项，异常 ${batch.abnormal} 项）：`);
          for (const m of batch.metrics) {
            const val = m.value != null ? String(m.value) : (m.valueText ?? '?');
            const range = m.referenceRangeLow != null && m.referenceRangeHigh != null
              ? `，参考区间 ${m.referenceRangeLow}-${m.referenceRangeHigh}` : '';
            const flag = m.isAbnormal === true
              ? `，[${(m.value != null && m.referenceRangeHigh != null && m.value > m.referenceRangeHigh) || (m.valueText && /高|↑/.test(m.valueText)) ? '偏高' : '异常'}]`
              : m.isAbnormal === false ? '' : '';
            lines.push(`- ${m.metricName}：${val}${m.unit ? ` ${m.unit}` : ''}（${batch.date}）${range}${flag}`);
          }
        }
      } else {
        lines.push(`就诊前后 7 天内的检验批次：无近期检验数据`);
      }

      lines.push('');
      if (hub.medsAtVisit.length > 0) {
        lines.push(`就诊时点在用药：`);
        for (const m of hub.medsAtVisit) {
          lines.push(`- ${m.name}${m.dosage ? ` ${m.dosage}` : ''}${m.frequency ? `（${m.frequency}）` : ''}${m.startDate ? `，起始 ${m.startDate}` : ''}`);
        }
      } else {
        lines.push(`就诊时点在用药：无记录`);
      }

      lines.push('');
      if (hub.conditionsAtVisit.length > 0) {
        lines.push(`就诊时点患病中的病史：`);
        for (const c of hub.conditionsAtVisit) {
          lines.push(`- ${c.name}${c.onsetDate ? `（起病 ${c.onsetDate}）` : ''}`);
        }
      } else {
        lines.push(`就诊时点患病中的病史：无记录`);
      }

      lines.push('');
      const before = comparison.before;
      const after = comparison.after;
      if (before && after) {
        lines.push(`上次就诊前后检验对比：上次批次 ${before.date}（距就诊 ${before.gapDays} 天）→ 后续批次 ${after.date}（就诊后 ${after.gapDays} 天）：`);
        for (const m of comparison.metrics) {
          if (m.presence !== 'both' || m.unitIncomparable) continue;
          const prev = m.prevValue ?? m.prevValueText ?? '?';
          const curr = m.value ?? m.valueText ?? '?';
          const dir = m.direction === 'up' ? '↑' : m.direction === 'down' ? '↓' : '→';
          lines.push(`- ${m.metricName}：${prev} → ${curr}${m.unit ? ` ${m.unit}` : ''}（${dir}${m.deltaPercent != null ? ` ${m.deltaPercent.toFixed(1)}%` : ''}）`);
        }
      } else if (before && !after) {
        lines.push(`上次就诊前后检验对比：上次批次 ${before.date}（距就诊 ${before.gapDays} 天），暂无就诊后检验批次`);
      } else if (!before && after) {
        lines.push(`上次就诊前后检验对比：本次为记录范围内首次就诊，就诊后批次 ${after.date} 为首次检验`);
      } else {
        lines.push(`上次就诊前后检验对比：本次为记录范围内首次就诊，且暂无后续检验批次`);
      }

      const userPrompt = lines.join('\n');

      // 5. 生成（同 healthReport 的 resolveModel 模式）
      const [user] = await ctx.db
        .select({ aiModel: users.aiModel })
        .from(users)
        .where(eq(users.id, ctx.userId))
        .limit(1);
      const modelId = user?.aiModel ?? process.env.AI_DEFAULT_MODEL ?? 'claude-sonnet-4-20250514';

      const { text } = await generateText({
        model: resolveModel(modelId, channel
          ? { baseUrl: channel.baseUrl, apiKey: channel.apiKey, protocol: channel.protocol }
          : undefined),
        system: encounterSummaryZhPrompt,
        prompt: userPrompt,
      });

      // 6. 存 insights（type 'encounter_summary'，重复生成保留历史）
      const [insight] = await ctx.db
        .insert(insights)
        .values({
          userId: ctx.userId,
          type: 'encounter_summary',
          content: text,
          generatedBy: modelId,
          contextTokenCount: estimateTokens(userPrompt),
          metadataJson: { encounterId: input.encounterId, profileId, question: '就诊摘要' },
        })
        .returning();

      return { id: insight!.id, content: text, model: modelId, createdAt: insight!.createdAt };
    }),

  latestEncounterSummary: protectedProcedure
    .input(z.object({ encounterId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const profileId = await getActiveProfileId(ctx.userId);
      const rows = await ctx.db
        .select()
        .from(insights)
        .where(and(eq(insights.userId, ctx.userId), eq(insights.type, 'encounter_summary')))
        .orderBy(desc(insights.createdAt))
        .limit(100);
      return rows.find((row) => {
        const metadata = row.metadataJson as Record<string, unknown> | null;
        return metadata?.profileId === profileId && metadata?.encounterId === input.encounterId;
      }) ?? null;
    }),
});
