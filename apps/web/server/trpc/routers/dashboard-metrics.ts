import { z } from 'zod';
import { and, eq, asc, desc, gte, lt, ne } from 'drizzle-orm';
import { createRouter, protectedProcedure } from '../init';
import {
  userDashboardMetrics,
  metricDefinitions,
  observations,
} from '@openvitals/database';
import { getActiveProfileId } from '../active-profile';

// 健康大屏关注指标（spec 17 §1）
// - list：已保存关注 + 预填候选（首次使用时展示态返回，不落库）
// - 预填口径：最新批次异常（isAbnormal=true）+ 临界（参考区间内但距边界 <10% 区间宽度）

export const dashboardMetricsRouter = createRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const profileId = await getActiveProfileId(ctx.userId);
    if (!profileId) {
      return { saved: [], suggested: [], savedCount: 0 };
    }

    const saved = await ctx.db
      .select({
        metricCode: userDashboardMetrics.metricCode,
        createdAt: userDashboardMetrics.createdAt,
      })
      .from(userDashboardMetrics)
      .where(
        and(
          eq(userDashboardMetrics.userId, ctx.userId),
          eq(userDashboardMetrics.profileId, profileId),
        ),
      )
      .orderBy(asc(userDashboardMetrics.createdAt));

    // 预填只在无任何保存记录时计算（首次使用）
    let suggested: Array<{ metricCode: string; metricName: string; reason: '异常' | '临界' }> = [];
    if (saved.length === 0) {
      // 最新检查日（与 compareBatches 同口径：按日聚类）
      const latest = await ctx.db
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

      if (latest.length > 0) {
        const dayStart = new Date(latest[0]!.observedAt);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);

        // 最新一天的行，口径与 compareBatches 一致：排除 unmatched / flagged
        const rows = await ctx.db
          .select({
            metricCode: observations.metricCode,
            metricName: metricDefinitions.name,
            valueNumeric: observations.valueNumeric,
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
          .limit(500);

        const seen = new Set<string>();
        for (const r of rows) {
          if (seen.has(r.metricCode)) continue;
          if (r.valueNumeric == null) continue;
          const reason =
            r.isAbnormal === true
              ? ('异常' as const)
              : isBorderline(
                  r.valueNumeric,
                  r.referenceRangeLow,
                  r.referenceRangeHigh,
                )
                ? ('临界' as const)
                : null;
          if (reason) {
            seen.add(r.metricCode);
            suggested.push({
              metricCode: r.metricCode,
              metricName: r.metricName ?? r.metricCode,
              reason,
            });
          }
          if (seen.size >= 12) break; // 预填上限，防卡片墙爆炸
        }
      }
    }

    return {
      saved,
      suggested,
      savedCount: saved.length,
    };
  }),

  add: protectedProcedure
    .input(z.object({ metricCode: z.string().min(1).max(50) }))
    .mutation(async ({ ctx, input }) => {
      const profileId = await getActiveProfileId(ctx.userId);
      if (!profileId) {
        throw new Error('当前没有活动的成员档案');
      }
      // onConflictDoNothing：重复关注幂等
      await ctx.db
        .insert(userDashboardMetrics)
        .values({
          userId: ctx.userId,
          profileId,
          metricCode: input.metricCode,
        })
        .onConflictDoNothing();
      return { success: true };
    }),

  remove: protectedProcedure
    .input(z.object({ metricCode: z.string().min(1).max(50) }))
    .mutation(async ({ ctx, input }) => {
      const profileId = await getActiveProfileId(ctx.userId);
      if (!profileId) {
        throw new Error('当前没有活动的成员档案');
      }
      await ctx.db
        .delete(userDashboardMetrics)
        .where(
          and(
            eq(userDashboardMetrics.userId, ctx.userId),
            eq(userDashboardMetrics.profileId, profileId),
            eq(userDashboardMetrics.metricCode, input.metricCode),
          ),
        );
      return { success: true };
    }),
});

// 临界判定：参考区间内但距任一边界 < 10% 区间宽度（spec 17 §1 定稿）
function isBorderline(
  value: number,
  low: number | null | undefined,
  high: number | null | undefined,
): boolean {
  if (low == null || high == null) return false;
  const span = high - low;
  if (span <= 0) return false;
  const margin = span * 0.1;
  return value > high - margin || value < low + margin;
}
