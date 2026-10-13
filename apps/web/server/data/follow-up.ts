// 医嘱复查提醒落库（spec 20 §5.4，v0.1.16 P4）。
// 挂载点：encounters.create / encounters.update / importJobs 候选确认（三处均为
// web 侧落库；worker 只产候选不直接插 encounters——2026-10-13 取证结论）。
// 模式对齐 0.1.14 ensureLearnedRange：调用方 try/catch 包裹，失败不阻断主流程。

import { and, eq, isNotNull } from 'drizzle-orm';
import { followUpReminders } from '@openvitals/database';
import type { Database } from '@openvitals/database/client';
import { parseFollowUpReminders } from './follow-up-parse';

export async function ensureFollowUpReminder(
  db: Database,
  params: {
    userId: string;
    profileId: string | null;
    encounterId: string;
    encounterDate: string;
    /** 医嘱文本：metadataJson.advice + summary 拼接（调用方拼好传入） */
    adviceText: string;
  },
): Promise<void> {
  const { userId, profileId, encounterId, encounterDate, adviceText } = params;

  const matches = parseFollowUpReminders(adviceText, encounterDate);
  // 多处匹配取最晚 due_date（保守：宁晚勿早），并在原文摘录上标注
  const latest = matches.length
    ? matches.reduce((a, b) => (b.dueDate > a.dueDate ? b : a))
    : null;

  // 幂等：先删本就诊的 pending 自动行（interval_days 非空）再插；
  // 手动补录行（interval_days 空）与已 done/dismissed 的行不动。
  await db
    .delete(followUpReminders)
    .where(
      and(
        eq(followUpReminders.encounterId, encounterId),
        eq(followUpReminders.status, 'pending'),
        isNotNull(followUpReminders.intervalDays),
      ),
    );

  if (latest) {
    await db.insert(followUpReminders).values({
      userId,
      profileId,
      encounterId,
      dueDate: latest.dueDate,
      sourceText:
        matches.length > 1
          ? `${latest.sourceText}（共 ${matches.length} 条医嘱匹配，取最晚）`
          : latest.sourceText,
      intervalDays: latest.intervalDays,
      status: 'pending',
    });
  }
}
