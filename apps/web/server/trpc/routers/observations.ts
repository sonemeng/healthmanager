import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and, inArray, ne, or, isNotNull, isNull, asc, sql } from 'drizzle-orm';
import { canonicalUnit } from '@openvitals/common';
import { createRouter, protectedProcedure } from '../init';
import type { Database } from '@openvitals/database/client';
import {
  listObservations,
  getObservationTrend,
  getObservationWithProvenance,
  observations,
  importJobs,
  metricDefinitions,
  profiles,
  referenceRanges,
  unitConversions,
} from '@openvitals/database';
import { emitEvent } from '@openvitals/events';
import { getActiveProfileId } from '../active-profile';
import { requestRangeRecompute } from '../../lib/worker-client';
import { readConversion } from '@/lib/conversion';
import {
  groupRowsByDay,
  buildBatches,
  fetchBatchRows,
  fetchConversions,
} from '../../data/batch-compare';

/**
 * 化验单区间学习入库（spec 19 §4 C2 + spec 21 S0b 六条硬约束）：
 * 被确认/纠正的观测行带报告原文区间时，先查后插写入学习行。
 *
 * spec 21 修掉的三个结构性缺陷：
 *   ① 人口学继承：旧实现硬编码 sex:null，学习行通配所有人，2a 又优先于国标 →
 *      creatinine 学习行 41~73（女性值）让男性 80 µmol/L 判「偏高」。现在按档案性别写入。
 *   ② 单位归一：旧实现存原文，µ/μ/u 三种写法在库里分家；现在写 canonicalUnit() 结果。
 *   ③ 冲突暴露：同 (指标, 单位, 性别) 已有区间且差异 >20% → 不自动择一，标 conflicted 交人工。
 *   另有溯源（observation_id）与晋升通道（≥3 份独立报告一致 → candidate）。
 *
 * 触发时机不变：只有人的 confirm / correct 才写学习行；自动通过（S4）绝不写。
 */
const LEARNED_RANGE_DIVERGENCE = 0.2;

/** 两个区间是否实质分歧：任一侧相对差 > 20%（0 与 0 视为一致） */
function rangesDiverge(
  aLow: number | null,
  aHigh: number | null,
  bLow: number | null,
  bHigh: number | null,
): boolean {
  const side = (x: number | null, y: number | null): boolean => {
    if (x === null || y === null) return false;
    const base = Math.max(Math.abs(x), Math.abs(y));
    return base > 0 && Math.abs(x - y) > LEARNED_RANGE_DIVERGENCE * base;
  };
  return side(aLow, bLow) || side(aHigh, bHigh);
}

/** 晋升通道（约束 6）：同 key 拿到 ≥3 份独立报告（按 import_job 去重）→ 标为字典候选 */
async function markPromotionCandidate(
  db: Database,
  key: {
    metricCode: string;
    unit: string;
    rangeLow: number | null;
    rangeHigh: number | null;
    sex: string | null;
  },
): Promise<void> {
  const obsLowCond =
    key.rangeLow === null
      ? isNull(observations.referenceRangeLow)
      : eq(observations.referenceRangeLow, key.rangeLow);
  const obsHighCond =
    key.rangeHigh === null
      ? isNull(observations.referenceRangeHigh)
      : eq(observations.referenceRangeHigh, key.rangeHigh);

  const [support] = await db
    .select({ jobs: sql<number>`count(distinct ${observations.importJobId})::int` })
    .from(observations)
    .where(
      and(
        eq(observations.metricCode, key.metricCode),
        eq(observations.unit, key.unit),
        obsLowCond,
        obsHighCond,
      ),
    );

  if ((support?.jobs ?? 0) < 3) return;

  const rowLowCond =
    key.rangeLow === null
      ? isNull(referenceRanges.rangeLow)
      : eq(referenceRanges.rangeLow, key.rangeLow);
  const rowHighCond =
    key.rangeHigh === null
      ? isNull(referenceRanges.rangeHigh)
      : eq(referenceRanges.rangeHigh, key.rangeHigh);
  const sexCond =
    key.sex === null ? isNull(referenceRanges.sex) : eq(referenceRanges.sex, key.sex);

  await db
    .update(referenceRanges)
    .set({ promotionStatus: 'candidate' })
    .where(
      and(
        eq(referenceRanges.metricCode, key.metricCode),
        eq(referenceRanges.unit, key.unit),
        isNotNull(referenceRanges.unit),
        rowLowCond,
        rowHighCond,
        sexCond,
      ),
    );
}

async function ensureLearnedRange(
  db: Database,
  row: {
    observationId: string;
    metricCode: string | null;
    unit: string | null;
    rangeLow: number | null;
    rangeHigh: number | null;
    metadataJson: unknown;
    profileId: string | null;
    /**
     * 来源覆盖（spec 21 S2）：人手填的区间不是「检验科区间」，标成后者等于给
     * 自填值套上化验单的可信度。默认按互认标识/检验科区间推导。
     */
    sourceOverride?: { source: string; tier: string };
  },
): Promise<void> {
  try {
    const { observationId, metricCode, rangeLow, rangeHigh, metadataJson, profileId } = row;
    if (!metricCode) return;
    // 约束 4：单位必须归一（µ/μ/u 三种写法不能分家）
    const unit = canonicalUnit(row.unit);
    if (!unit) return;
    if (rangeLow === null && rangeHigh === null) return;

    // 约束 1：继承档案人口学（不是账号；多档案家庭不能串）
    let sex: string | null = null;
    if (profileId) {
      const [profile] = await db
        .select({ gender: profiles.gender })
        .from(profiles)
        .where(eq(profiles.id, profileId))
        .limit(1);
      sex = profile?.gender ?? null;
    }
    // 档案未填性别 → 不猜，sex 留 null（UI 层应提示补全档案，而不是这里硬编一个性别）

    // 互认标识（如「陕HR」）：只收非空字符串，其余一律兜底专业口径
    const mark = (metadataJson as { interopMark?: unknown } | null)?.interopMark;
    const source =
      row.sourceOverride?.source ??
      (typeof mark === 'string' && mark.trim() !== '' ? mark.trim() : '检验科区间');
    const sourceTier = row.sourceOverride?.tier ?? 'lab_learned';

    const sexCond = sex === null ? isNull(referenceRanges.sex) : eq(referenceRanges.sex, sex);
    const lowCond =
      rangeLow === null ? isNull(referenceRanges.rangeLow) : eq(referenceRanges.rangeLow, rangeLow);
    const highCond =
      rangeHigh === null
        ? isNull(referenceRanges.rangeHigh)
        : eq(referenceRanges.rangeHigh, rangeHigh);

    // 完全相同的键已存在 → 幂等：只补溯源，不重复插入
    const [existing] = await db
      .select({ id: referenceRanges.id, observationId: referenceRanges.observationId })
      .from(referenceRanges)
      .where(
        and(
          eq(referenceRanges.metricCode, metricCode),
          eq(referenceRanges.unit, unit),
          isNotNull(referenceRanges.unit),
          sexCond,
          lowCond,
          highCond,
        ),
      )
      .limit(1);

    if (existing) {
      if (!existing.observationId) {
        await db
          .update(referenceRanges)
          .set({ observationId })
          .where(eq(referenceRanges.id, existing.id));
      }
      await markPromotionCandidate(db, { metricCode, unit, rangeLow, rangeHigh, sex });
      return;
    }

    // 约束 5：同 (指标, 单位, 性别) 已有区间且差异 >20% → 不自动择一，标冲突交人工
    const siblings = await db
      .select({ id: referenceRanges.id, rangeLow: referenceRanges.rangeLow, rangeHigh: referenceRanges.rangeHigh })
      .from(referenceRanges)
      .where(
        and(
          eq(referenceRanges.metricCode, metricCode),
          eq(referenceRanges.unit, unit),
          isNotNull(referenceRanges.unit),
          sexCond,
        ),
      );

    const conflicts = siblings.filter((s) =>
      rangesDiverge(rangeLow, rangeHigh, s.rangeLow, s.rangeHigh),
    );

    if (conflicts.length > 0) {
      await db
        .update(referenceRanges)
        .set({
          conflictStatus: 'conflicted',
          conflictNote:
            `与另一条学习行区间差异 >20%，未自动择一；` +
            `新报告区间 ${rangeLow ?? '—'}~${rangeHigh ?? '—'} ${unit}（观测 ${observationId}）`,
        })
        .where(inArray(referenceRanges.id, conflicts.map((c) => c.id)));
      return;
    }

    await db
      .insert(referenceRanges)
      .values({
        metricCode,
        sex,
        ageMin: null,
        ageMax: null,
        rangeLow,
        rangeHigh,
        rangeText: null,
        source,
        unit,
        sourceTier,
        // 约束 3：必须可溯源（点开能回到原报告）
        observationId,
      })
      .onConflictDoNothing();

    await markPromotionCandidate(db, { metricCode, unit, rangeLow, rangeHigh, sex });
  } catch (err) {
    console.error('[observations] ensureLearnedRange failed:', err instanceof Error ? err.message : err);
  }
}

/**
 * 任务收尾判定（spec 21 §4.3）：只要还有 extracted / flagged / range_pending，
 * 任务就不能算完成。漏掉 range_pending 会让用户处理完所有待办后任务永远卡在
 * review_needed —— 这是 S1 里已经证实过的坑，故收口到唯一实现。
 */
async function markJobCompletedIfDone(
  db: Database,
  userId: string,
  jobId: string | null,
): Promise<void> {
  if (!jobId) return;
  const pending = await db
    .select({ id: observations.id })
    .from(observations)
    .where(
      and(
        eq(observations.importJobId, jobId),
        eq(observations.userId, userId),
        inArray(observations.status, ['extracted', 'flagged', 'range_pending']),
      ),
    )
    .limit(1);

  if (pending.length === 0) {
    await db
      .update(importJobs)
      .set({ status: 'completed', needsReview: false, completedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(importJobs.id, jobId), eq(importJobs.userId, userId)));
  }
}

/**
 * 处理完待办后清理门禁留痕（spec 21 S2）：
 * gateCode / gateReason 描述的是「此刻待定」，人被处理完再留着就会变成幽灵待办
 * （实测 5 条历史留痕里 4 条是这种）。改为写一条 rangeResolution 记「谁怎么处理的」。
 */
function resolveGateMetadata(
  metadataJson: unknown,
  resolution: { action: string; note?: string; remembered?: boolean },
): Record<string, unknown> | null {
  const meta = { ...((metadataJson as Record<string, unknown> | null) ?? {}) };
  delete meta.gateCode;
  delete meta.gateReason;
  meta.rangeResolution = {
    action: resolution.action,
    at: new Date().toISOString(),
    ...(resolution.note ? { note: resolution.note } : {}),
    ...(resolution.remembered ? { remembered: true } : {}),
  };
  return meta;
}

/** 判读：单侧区间只判有界的一侧；无区间返回 null（交给调用方决定保留原值） */
function computeAbnormal(
  value: number | null,
  low: number | null,
  high: number | null,
): boolean | null {
  if (value === null) return null;
  if (low === null && high === null) return null;
  return (high !== null && value > high) || (low !== null && value < low);
}

export const observationsRouter = createRouter({
  list: protectedProcedure
    .input(z.object({
      category: z.string().optional(),
      metricCode: z.string().optional(),
      dateFrom: z.date().optional(),
      dateTo: z.date().optional(),
      status: z.string().optional(),
      limit: z.number().min(1).max(200).default(50),
      cursor: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const offset = input.cursor ? parseInt(input.cursor, 10) : 0;
      const profileId = await getActiveProfileId(ctx.userId);
      const items = await listObservations(ctx.db, {
        userId: ctx.userId,
        profileId,
        category: input.category,
        metricCode: input.metricCode,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        status: input.status,
        limit: input.limit + 1,
        offset,
      });

      let nextCursor: string | null = null;
      if (items.length > input.limit) {
        items.pop();
        nextCursor = String(offset + input.limit);
      }

      return { items, nextCursor };
    }),

  trend: protectedProcedure
    .input(z.object({
      metricCode: z.string(),
      dateFrom: z.date(),
      dateTo: z.date(),
      granularity: z.enum(['raw', 'daily', 'weekly', 'monthly']).default('raw'),
    }))
    .query(async ({ ctx, input }) => {
      const rows = await getObservationTrend(ctx.db, {
        userId: ctx.userId,
        profileId: await getActiveProfileId(ctx.userId),
        metricCode: input.metricCode,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
      });

      // 换算标记随点返回（spec 21 §15.7 S5.5 P2）：图表 tooltip 要说明「这个点是从哪个单位换来的」，
      // 而趋势接口原先只给 value/unit，前端无法判断精度该走哪套规则（§15.6 N1 同型问题）
      const dataPoints = rows.map((r) => {
        const conv = readConversion(r.metadataJson);
        return {
          date: r.observedAt,
          value: r.valueNumeric,
          unit: r.unit,
          converted: conv !== null,
          fromUnit: conv?.fromUnit ?? null,
        };
      });

      return { dataPoints };
    }),

  // 批次对比：同一天 = 一次检查（observedAt 按日聚合，同指标同天取最新确认的一条），
  // 每次检查 vs 紧邻上一次的全量对比（spec 16 §1）。
  // 参与口径：metricCode ≠ 'unmatched' 且 status ≠ 'flagged'；单位不一致时经
  // unit_conversions 换算到字典基准单位，无换算规则的指标标记「单位不可比」不比。
  // 分组/对齐计算在 server/data/batch-compare.ts（spec 20 §3.2 抽离共享，
  // 与就诊前后疗效对比 encounterComparison 同一来源）。
  compareBatches: protectedProcedure
    .query(async ({ ctx }) => {
      const profileId = await getActiveProfileId(ctx.userId);

      const rows = await fetchBatchRows(ctx.db, ctx.userId, profileId);
      const conversions = await fetchConversions(ctx.db);

      const days = groupRowsByDay(rows);
      const batches = buildBatches(days, conversions);

      return { batches };
    }),

  getWithProvenance: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const result = await getObservationWithProvenance(ctx.db, {
        observationId: input.id,
        userId: ctx.userId,
      });
      return result ?? null;
    }),

  correct: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      valueNumeric: z.number().optional(),
      valueText: z.string().optional(),
      metricCode: z.string().optional(),
      unit: z.string().optional(),
      correctionNote: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...corrections } = input;

      // Read current row
      const [current] = await ctx.db
        .select()
        .from(observations)
        .where(and(eq(observations.id, id), eq(observations.userId, ctx.userId)))
        .limit(1);

      if (!current) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Observation not found' });
      }

      await ctx.db
        .update(observations)
        .set({
          ...(corrections.valueNumeric !== undefined && { valueNumeric: corrections.valueNumeric }),
          ...(corrections.valueText !== undefined && { valueText: corrections.valueText }),
          ...(corrections.metricCode !== undefined && { metricCode: corrections.metricCode }),
          ...(corrections.unit !== undefined && { unit: corrections.unit }),
          originalValueNumeric: current.originalValueNumeric ?? current.valueNumeric,
          originalValueText: current.originalValueText ?? current.valueText,
          originalUnit: current.originalUnit ?? current.unit,
          correctionNote: corrections.correctionNote,
          status: 'corrected',
          updatedAt: new Date(),
        })
        .where(and(eq(observations.id, id), eq(observations.userId, ctx.userId)));

      const changes: Record<string, { from: unknown; to: unknown }> = {};
      if (corrections.valueNumeric !== undefined) {
        changes.valueNumeric = { from: current.valueNumeric, to: corrections.valueNumeric };
      }
      if (corrections.valueText !== undefined) {
        changes.valueText = { from: current.valueText, to: corrections.valueText };
      }
      if (corrections.metricCode !== undefined) {
        changes.metricCode = { from: current.metricCode, to: corrections.metricCode };
      }
      if (corrections.unit !== undefined) {
        changes.unit = { from: current.unit, to: corrections.unit };
      }

      // 化验单区间学习（spec 19 §4）：纠正后的行代表用户认可的数据——
      // metricCode/unit 取纠正后的值，区间取行上的报告原文区间（correct 不改区间列），
      // source 沿用观测行的互认标识（如陕HR），无标识则「检验科区间」。
      await ensureLearnedRange(ctx.db, {
        observationId: id,
        metricCode: corrections.metricCode ?? current.metricCode,
        unit: corrections.unit ?? current.unit,
        rangeLow: current.referenceRangeLow,
        rangeHigh: current.referenceRangeHigh,
        metadataJson: current.metadataJson,
        profileId: current.profileId,
      });

      emitEvent({
        type: 'observation.corrected',
        payload: {
          observationId: id,
          metricCode: corrections.metricCode ?? current.metricCode,
          changes,
        },
        userId: ctx.userId,
        timestamp: new Date(),
      });

      return { success: true };
    }),

  confirm: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .update(observations)
        .set({ status: 'confirmed', updatedAt: new Date() })
        .where(and(eq(observations.id, input.id), eq(observations.userId, ctx.userId)))
        .returning({
          importJobId: observations.importJobId,
          profileId: observations.profileId,
          metricCode: observations.metricCode,
          unit: observations.unit,
          rangeLow: observations.referenceRangeLow,
          rangeHigh: observations.referenceRangeHigh,
          metadataJson: observations.metadataJson,
        });

      if (!result.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Observation not found' });
      }

      // 化验单区间学习（spec 19 §4）：确认 = 用户背书该报告原文区间 → 先查后插学习行
      // source 沿用观测行的互认标识（如陕HR），无标识则「检验科区间」。
      const confirmed = result[0]!;
      await ensureLearnedRange(ctx.db, {
        observationId: input.id,
        metricCode: confirmed.metricCode,
        unit: confirmed.unit,
        rangeLow: confirmed.rangeLow,
        rangeHigh: confirmed.rangeHigh,
        metadataJson: confirmed.metadataJson,
        profileId: confirmed.profileId,
      });

      // Do not complete an import while an unmatched item still needs a user decision.
      await markJobCompletedIfDone(ctx.db, ctx.userId, result[0]!.importJobId);

      emitEvent({
        type: 'observation.confirmed',
        payload: { observationId: input.id },
        userId: ctx.userId,
        timestamp: new Date(),
      });

      return { success: true };
    }),

  /**
   * 处理「区间待定」行（spec 21 §4.4）。三个动作，每个待办都必须有出口：
   *   keep_blank —— 值可信，但区间确实无从确定 → confirmed，**不写学习行**
   *   set        —— 手工补区间 → 重算判读 + confirmed；remember 时写学习行
   *   rematch    —— 其实不是这个指标 → 改挂 + 让 worker 重算区间
   *
   * remember 是这套设计的关键收益点：补一次区间，下一份同单位报告走优先级 2a
   * （学习行，永不门禁），从此不再进队列——形成「拦截 → 一次性人工 → 自动放行」的
   * 收敛回路，而不是每次都拦。前提写死：只有人手填的才写学习行，绝不从字典区间反推。
   */
  resolveRange: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      action: z.enum(['keep_blank', 'set', 'rematch']),
      low: z.number().finite().nullable().optional(),
      high: z.number().finite().nullable().optional(),
      text: z.string().max(120).optional(),
      remember: z.boolean().optional(),
      metricCode: z.string().min(1).max(50).optional(),
      note: z.string().max(200).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [current] = await ctx.db
        .select()
        .from(observations)
        .where(and(eq(observations.id, input.id), eq(observations.userId, ctx.userId)))
        .limit(1);

      if (!current) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Observation not found' });
      }

      // 未匹配指标（metricCode='unmatched'）不能直接补区间：既算不出判读，
      // 也会把区间写进一条名为 unmatched 的指标下。必须先改挂（动作 ③）。
      if (current.metricCode === 'unmatched' && input.action !== 'rematch') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: '该行还没匹配到指标，请先「改挂」到正确指标再处理区间',
        });
      }

      // ── ① 确认无区间 ──────────────────────────────────────────────────────
      if (input.action === 'keep_blank') {
        await ctx.db
          .update(observations)
          .set({
            status: 'confirmed',
            metadataJson: resolveGateMetadata(current.metadataJson, {
              action: 'keep_blank',
              note: input.note,
            }),
            updatedAt: new Date(),
          })
          .where(and(eq(observations.id, current.id), eq(observations.userId, ctx.userId)));

        await markJobCompletedIfDone(ctx.db, ctx.userId, current.importJobId);
        emitEvent({
          type: 'observation.range_resolved',
          payload: { observationId: current.id, action: 'keep_blank', metricCode: current.metricCode },
          userId: ctx.userId,
          timestamp: new Date(),
        });
        return { success: true, recomputed: true };
      }

      // ── ② 手工补区间 ──────────────────────────────────────────────────────
      if (input.action === 'set') {
        const low = input.low ?? null;
        const high = input.high ?? null;
        const text = input.text?.trim() ? input.text.trim() : null;

        if (low === null && high === null && text === null) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: '至少填写下限、上限或区间原文之一',
          });
        }
        if (low !== null && high !== null && low > high) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: '下限不能大于上限' });
        }

        // 判读按新区间重算（单侧区间只判有界的一侧）；无区间时保留原判读
        const isAbnormal = computeAbnormal(current.valueNumeric, low, high) ?? current.isAbnormal;
        const remembered = input.remember === true && (low !== null || high !== null);

        await ctx.db
          .update(observations)
          .set({
            referenceRangeLow: low,
            referenceRangeHigh: high,
            referenceRangeText: text,
            isAbnormal,
            status: 'confirmed',
            metadataJson: resolveGateMetadata(current.metadataJson, {
              action: 'set',
              note: input.note,
              remembered,
            }),
            updatedAt: new Date(),
          })
          .where(and(eq(observations.id, current.id), eq(observations.userId, ctx.userId)));

        if (remembered) {
          await ensureLearnedRange(ctx.db, {
            observationId: current.id,
            metricCode: current.metricCode,
            unit: current.unit,
            rangeLow: low,
            rangeHigh: high,
            metadataJson: current.metadataJson,
            profileId: current.profileId,
            // 人手填的不是化验单印的，来源必须如实标 —— 否则等于自填值冒充检验科口径
            sourceOverride: { source: '手工补录', tier: 'user_input' },
          });
        }

        await markJobCompletedIfDone(ctx.db, ctx.userId, current.importJobId);
        emitEvent({
          type: 'observation.range_resolved',
          payload: {
            observationId: current.id,
            action: 'set',
            metricCode: current.metricCode,
            rangeLow: low,
            rangeHigh: high,
            remembered,
          },
          userId: ctx.userId,
          timestamp: new Date(),
        });
        return { success: true, recomputed: true, remembered };
      }

      // ── ③ 改挂指标 ────────────────────────────────────────────────────────
      const metricCode = input.metricCode?.trim();
      if (!metricCode) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '请选择要改挂的指标' });
      }
      if (metricCode === current.metricCode) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '所选指标与当前一致，无需改挂' });
      }

      const [metric] = await ctx.db
        .select({ id: metricDefinitions.id })
        .from(metricDefinitions)
        .where(eq(metricDefinitions.id, metricCode))
        .limit(1);
      if (!metric) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '指标不存在' });
      }

      // 旧区间属于旧指标，必须清空——带着旧指标的区间去判新指标，比没有区间更糟。
      // 状态先落 range_pending：重算成功由 worker 降级为 extracted（待确认），失败则留在待定。
      const meta = { ...((current.metadataJson as Record<string, unknown> | null) ?? {}) };
      delete meta.gateCode;
      delete meta.gateReason;
      meta.rangeResolution = {
        action: 'rematch',
        at: new Date().toISOString(),
        from: current.metricCode,
        to: metricCode,
        ...(input.note ? { note: input.note } : {}),
      };

      await ctx.db
        .update(observations)
        .set({
          metricCode,
          referenceRangeLow: null,
          referenceRangeHigh: null,
          referenceRangeText: null,
          isAbnormal: null,
          status: 'range_pending',
          metadataJson: meta,
          updatedAt: new Date(),
        })
        .where(and(eq(observations.id, current.id), eq(observations.userId, ctx.userId)));

      // 重算是「改挂」的必要收尾：不算就等于把一个已知区间待定的行丢回队列。
      // 失败也不回滚改挂本身（那是用户的判断），行留在 range_pending 等下次重算。
      const recompute = await requestRangeRecompute({
        userId: ctx.userId,
        observationIds: [current.id],
        includeExisting: true,
      });

      await markJobCompletedIfDone(ctx.db, ctx.userId, current.importJobId);
      emitEvent({
        type: 'observation.range_resolved',
        payload: {
          observationId: current.id,
          action: 'rematch',
          from: current.metricCode,
          to: metricCode,
          recomputed: recompute.ok,
        },
        userId: ctx.userId,
        timestamp: new Date(),
      });

      return {
        success: true,
        recomputed: recompute.ok,
        recomputeError: recompute.ok ? undefined : recompute.error,
      };
    }),

  /**
   * 批量出口（spec 21 §4.5-5）：「全部确认无区间」。
   * 一份报告真命中 20 条待办时，逐个点会把人逼疯，也会训练出「见待定就点」的条件反射。
   */
  resolveAllBlank: protectedProcedure
    .input(z.object({ importJobId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({ id: observations.id, metadataJson: observations.metadataJson })
        .from(observations)
        .where(
          and(
            eq(observations.importJobId, input.importJobId),
            eq(observations.userId, ctx.userId),
            eq(observations.status, 'range_pending'),
          ),
        );

      for (const row of rows) {
        await ctx.db
          .update(observations)
          .set({
            status: 'confirmed',
            metadataJson: resolveGateMetadata(row.metadataJson, { action: 'keep_blank_batch' }),
            updatedAt: new Date(),
          })
          .where(and(eq(observations.id, row.id), eq(observations.userId, ctx.userId)));
      }

      await markJobCompletedIfDone(ctx.db, ctx.userId, input.importJobId);

      if (rows.length > 0) {
        emitEvent({
          type: 'observation.range_resolved',
          payload: { importJobId: input.importJobId, action: 'keep_blank_batch', count: rows.length },
          userId: ctx.userId,
          timestamp: new Date(),
        });
      }

      return { success: true, resolved: rows.length };
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(observations)
        .where(and(eq(observations.id, input.id), eq(observations.userId, ctx.userId)));
      return { success: true };
    }),
});
