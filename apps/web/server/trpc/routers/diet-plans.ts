import { z } from 'zod';
import { and, eq, desc, gte, lt, ne } from 'drizzle-orm';
import { createRouter, protectedProcedure } from '../init';
import {
  dietPlans,
  observations,
  metricDefinitions,
  medications,
  conditions,
  profiles,
  users,
  aiChannels,
} from '@openvitals/database';
import { resolveModel } from '@openvitals/ai';
import { generateText } from 'ai';
import { getActiveProfileId } from '../active-profile';
import {
  FOOD_CANDIDATES,
  FOOD_CATEGORIES,
  FORBIDDEN_POOL,
} from '../../data/food-library';
import { dietPlanSystemPrompt } from '../../prompts/diet-plan';

// AI 饮食清单（spec 17 §2）：候选池是客观事实，档位/食用量/说明由模型
// 结合当期指标、用药、过敏史现场生成；每次生成 = 新存档行（留痕）。

const DISCLAIMER_TEXT =
  '本清单由 AI 根据您录入本系统的近期检验指标、病史与在用药物生成，仅供日常饮食参考，不构成医疗建议或诊疗方案。食物档位依据国家卫健委《成人高血压/高脂血症/糖尿病食养指南（2023 年版）》（现行最新版）等公开资料的一般性原则调整。未录入本系统的信息（如未记录的过敏史、未录入的药物与保健品、医生当面嘱咐的特殊饮食要求）无法被考虑；如与医生或营养师的嘱咐冲突，请以医嘱为准。';

// 候选池压缩文本：`燕麦[全谷物|低GI|高纤维]` 每类一行块
function formatFoodPool(): string {
  return FOOD_CATEGORIES.map((cat) => {
    const items = FOOD_CANDIDATES.filter((f) => f.category === cat.key);
    return `【${cat.label}】\n` + items.map((f) => `- ${f.name}（${f.tags.join('、')}）`).join('\n');
  }).join('\n\n');
}

function formatForbiddenPool(): string {
  return FORBIDDEN_POOL.map(
    (f, i) =>
      `${i + 1}. [${f.type}] ${f.item}｜机制：${f.reason}｜关联指标：${f.relatedMetrics.join('、')}`,
  ).join('\n');
}

// 解析模型输出：剥掉可能的 markdown 围栏后 JSON.parse
function parseModelJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error('模型输出无法解析为清单 JSON，请重试或更换模型');
  }
}

// 收集用户在历史存档编辑版（editedJson）中手动添加过的自定义食物
// （不在预置候选池的名称 → 下次生成时并入候选池，spec 17 用户增项需求）
function collectCustomFoods(archives: Array<{ editedJson: unknown }>): string[] {
  const presetNames = new Set(FOOD_CANDIDATES.map((f) => f.name));
  const custom = new Set<string>();
  for (const row of archives) {
    const source = row.editedJson;
    if (!source || typeof source !== 'object') continue;
    const categories = (source as Record<string, unknown>).categories;
    if (!Array.isArray(categories)) continue;
    for (const cat of categories as Array<Record<string, unknown>>) {
      const items = cat.items;
      if (!Array.isArray(items)) continue;
      for (const item of items as Array<Record<string, unknown>>) {
        const name = typeof item.name === 'string' ? item.name.trim() : '';
        if (name && !presetNames.has(name)) custom.add(name);
      }
    }
  }
  return Array.from(custom);
}

// 校验生成的 JSON 结构（宽松：字段存在 + level 合法）
function validatePlan(plan: unknown): void {
  if (!plan || typeof plan !== 'object') throw new Error('模型输出为空');
  const p = plan as Record<string, unknown>;
  if (!Array.isArray(p.categories) || p.categories.length === 0) {
    throw new Error('模型输出缺少食物分类数据');
  }
  const validLevels = new Set(['推荐', '适量', '限制', '避免']);
  for (const cat of p.categories as Array<Record<string, unknown>>) {
    if (!Array.isArray(cat.items)) continue;
    for (const item of cat.items as Array<Record<string, unknown>>) {
      if (typeof item.name !== 'string') throw new Error('模型输出食物条目缺少名称');
      if (typeof item.level !== 'string' || !validLevels.has(item.level)) {
        throw new Error(`模型输出档位不合法：${String(item.level)}`);
      }
    }
  }
}

export const dietPlansRouter = createRouter({
  // 生成（manual 触发；输入即当前成员数据，无用户参数）
  generate: protectedProcedure.mutation(async ({ ctx }) => {
    const profileId = await getActiveProfileId(ctx.userId);
    if (!profileId) throw new Error('当前没有活动的成员档案');

    // 1. 最新检查日（与 compareBatches 同口径：按日聚类）
    const [latest] = await ctx.db
      .select({ observedAt: observations.observedAt })
      .from(observations)
      .where(
        and(
          eq(observations.userId, ctx.userId),
          eq(observations.profileId, profileId),
        ),
      )
      .orderBy(desc(observations.observedAt))
      .limit(1);

    if (!latest) {
      throw new Error('还没有任何检验数据，请先上传体检报告');
    }

    const dayStart = new Date(latest.observedAt);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const batchDate = `${dayStart.getFullYear()}-${String(dayStart.getMonth() + 1).padStart(2, '0')}-${String(dayStart.getDate()).padStart(2, '0')}`;

    // 2. 最新批次全量指标（含异常标记；排除 unmatched/flagged）
    const rows = await ctx.db
      .select({
        metricName: metricDefinitions.name,
        metricCode: observations.metricCode,
        valueNumeric: observations.valueNumeric,
        valueText: observations.valueText,
        unit: observations.unit,
        referenceRangeLow: observations.referenceRangeLow,
        referenceRangeHigh: observations.referenceRangeHigh,
        isAbnormal: observations.isAbnormal,
      })
      .from(observations)
      .leftJoin(
        metricDefinitions,
        eq(observations.metricCode, metricDefinitions.id),
      )
      .where(
        and(
          eq(observations.userId, ctx.userId),
          eq(observations.profileId, profileId),
          ne(observations.metricCode, 'unmatched'),
          ne(observations.status, 'flagged'),
          gte(observations.observedAt, dayStart),
          lt(observations.observedAt, dayEnd),
        ),
      )
      .limit(300);

    if (rows.length === 0) {
      throw new Error('最新检查日没有可用指标数据');
    }

    const metricLines = rows
      .map((r) => {
        const name = r.metricName ?? r.metricCode;
        const value = r.valueNumeric != null ? `${r.valueNumeric}${r.unit ? ' ' + r.unit : ''}` : (r.valueText ?? '?');
        const range = r.referenceRangeLow != null && r.referenceRangeHigh != null
          ? `参考 ${r.referenceRangeLow}–${r.referenceRangeHigh}${r.unit ? ' ' + r.unit : ''}`
          : '无参考区间';
        return `- ${name}：${value}（${range}）${r.isAbnormal === true ? '【异常】' : ''}`;
      })
      .join('\n');

    // 3. 在用药物 / 病史 / 档案（含过敏史）
    const [meds, conds, profileRows] = await Promise.all([
      ctx.db
        .select({ name: medications.name, dosage: medications.dosage, frequency: medications.frequency })
        .from(medications)
        .where(
          and(
            eq(medications.userId, ctx.userId),
            eq(medications.profileId, profileId),
            eq(medications.isActive, true),
          ),
        )
        .limit(30),
      ctx.db
        .select({ name: conditions.name, status: conditions.status })
        .from(conditions)
        .where(
          and(
            eq(conditions.userId, ctx.userId),
            eq(conditions.profileId, profileId),
          ),
        )
        .limit(20),
      ctx.db
        .select({
          name: profiles.name,
          gender: profiles.gender,
          birthDate: profiles.birthDate,
          allergies: profiles.allergies,
        })
        .from(profiles)
        .where(and(eq(profiles.id, profileId), eq(profiles.userId, ctx.userId)))
        .limit(1),
    ]);

    const p = profileRows[0];
    const medsText = meds.length > 0
      ? meds.map((m) => `- ${m.name}${m.dosage ? ` ${m.dosage}` : ''}${m.frequency ? `（${m.frequency}）` : ''}`).join('\n')
      : '无记录';
    const condsText = conds.length > 0
      ? conds.map((c) => `- ${c.name}（${c.status ?? 'active'}）`).join('\n')
      : '无记录';
    const profileText = p
      ? `姓名：${p.name}；性别：${p.gender ?? '未填写'}；出生日期：${p.birthDate ?? '未填写'}；过敏史：${p.allergies ?? '无记录'}`
      : '档案信息不完整';

    // 用户手动添加过的自定义食物（历史存档编辑版）→ 并入候选池
    const archives = await ctx.db
      .select({ editedJson: dietPlans.editedJson })
      .from(dietPlans)
      .where(
        and(
          eq(dietPlans.userId, ctx.userId),
          eq(dietPlans.profileId, profileId),
        ),
      )
      .orderBy(desc(dietPlans.generatedAt))
      .limit(20);
    const customFoods = collectCustomFoods(archives);
    const customPoolText = customFoods.length > 0
      ? `\n\n【用户自定义食物（同样只能从以下名称中选，需正常评估给档位）】\n${customFoods.map((n) => `- ${n}`).join('\n')}`
      : '';

    const userPrompt = `【成员档案】\n${profileText}\n\n【病史】\n${condsText}\n\n【在用药物（判断药物-食物相互作用必需）】\n${medsText}\n\n【最新一次检查（${batchDate}）的全部指标】\n${metricLines}\n\n【候选食物池（只能从中选择食物）】\n${formatFoodPool()}${customPoolText}\n\n【禁止事项池（只能从中挑选适用条目，结合本人用药/指标改写原因）】\n${formatForbiddenPool()}\n\n请为该成员生成个性化饮食清单 JSON。`;

    // 4. 渠道与模型（同健康报告链路）
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
      system: dietPlanSystemPrompt,
      prompt: userPrompt,
    });

    // 5. 解析 + 校验 + 存档
    const plan = parseModelJson(text);
    validatePlan(plan);

    const [saved] = await ctx.db
      .insert(dietPlans)
      .values({
        userId: ctx.userId,
        profileId,
        batchDate,
        model: modelId,
        contentJson: plan,
        disclaimerText: DISCLAIMER_TEXT,
      })
      .returning();

    return { id: saved!.id, plan, disclaimerText: DISCLAIMER_TEXT, batchDate, model: modelId };
  }),

  // 历史存档列表（batchDate 倒序）
  list: protectedProcedure.query(async ({ ctx }) => {
    const profileId = await getActiveProfileId(ctx.userId);
    if (!profileId) return [];
    return ctx.db
      .select({
        id: dietPlans.id,
        batchDate: dietPlans.batchDate,
        generatedAt: dietPlans.generatedAt,
        model: dietPlans.model,
        editedAt: dietPlans.editedAt,
      })
      .from(dietPlans)
      .where(
        and(
          eq(dietPlans.userId, ctx.userId),
          eq(dietPlans.profileId, profileId),
        ),
      )
      .orderBy(desc(dietPlans.generatedAt))
      .limit(50);
  }),

  // 单条存档（含生成原版与编辑版）
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select()
        .from(dietPlans)
        .where(
          and(
            eq(dietPlans.id, input.id),
            eq(dietPlans.userId, ctx.userId),
          ),
        )
        .limit(1);
      return row ?? null;
    }),

  // 保存手动编辑（写 editedJson，生成原版留痕不动）
  update: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      editedJson: z.unknown(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .update(dietPlans)
        .set({ editedJson: input.editedJson, editedAt: new Date() })
        .where(
          and(
            eq(dietPlans.id, input.id),
            eq(dietPlans.userId, ctx.userId),
          ),
        )
        .returning({ id: dietPlans.id });
      if (!result.length) throw new Error('清单不存在');
      return { success: true };
    }),
});
