// 医嘱复查时间解析（spec 20 §5.3，v0.1.16 P4）。
// 纯函数：输入医嘱文本 + 就诊日（YYYY-MM-DD），输出可解析出的复查提醒匹配。
// 设计铁律（用户 2026-10-13 拍板）：
//   - 「定期复查」「择期复查」等无明确期限 → 不输出（禁止猜默认周期，不编数据）；
//   - 多处匹配 → 由调用方取最晚 due_date（保守：宁晚勿早）；
//   - 月按 30 天、年按 365 天换算（第一版口径，intervalDays 留审计字段可回溯）。

export interface FollowUpMatch {
  /** 复查应做日期（YYYY-MM-DD，就诊日 + intervalDays） */
  dueDate: string;
  /** 解析出的间隔天数（审计用；手动补录的提醒无此字段） */
  intervalDays: number;
  /** 命中的医嘱原文片段（截断展示用） */
  sourceText: string;
}

// 中文数字 → 数值（一~九十九足够覆盖医嘱场景；纯数字串直接 parseFloat）
const CN_DIGITS: Record<string, number> = {
  一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};

function parseCnNumber(text: string): number | null {
  if (/^[0-9]+$/.test(text)) return Number.parseInt(text, 10);
  // 单字数字
  if (text.length === 1) return CN_DIGITS[text] ?? null;
  // 十 的组合：十(X) / X十(Y)
  const m = /^([一二两三四五六七八九]?)(十)([一二两三四五六七八九]?)$/.exec(text);
  if (m) {
    const tens = m[1] ? CN_DIGITS[m[1]!]! : 1;
    const ones = m[3] ? CN_DIGITS[m[3]!]! : 0;
    return tens * 10 + ones;
  }
  return null;
}

// 单位 → 天数
const UNIT_DAYS: Record<string, number> = {
  年: 365,
  月: 30,
  个月: 30,
  周: 7,
  星期: 7,
  天: 1,
  日: 1,
};

// YYYY-MM-DD 加 N 天（UTC 算术，纯函数不受时区影响）
function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// 间隔模式：
//   数量：中文数字/阿拉伯数字，或「半」（0.5，如「半年复查」）
//   单位：年/月/个月/周/星期/天/日
//   尾缀「半」：再加半个单位（如「一年半」= 365 + 182 ≈ 548）
//   后缀：之?后|内（可选）+ 复查/复诊/随访/监测/复检（必需——没有复查动词的时间表述不构成提醒）
const INTERVAL_RE =
  /(?:(半)|([0-9]+|[一二两三四五六七八九十]{1,3}))\s*(个?月|周|星期|天|日|年)(半)?\s*(?:之?后|内)?\s*(?:复查|复诊|随访|监测|复检)/g;

/**
 * 解析医嘱文本中的复查时间。返回全部匹配（含重复日期），调用方自行取最晚。
 * 无明确期限（如「定期复查」）不产生输出。
 */
export function parseFollowUpReminders(
  adviceText: string,
  encounterDate: string,
): FollowUpMatch[] {
  if (!adviceText || !/^\d{4}-\d{2}-\d{2}$/.test(encounterDate)) return [];

  const matches: FollowUpMatch[] = [];
  INTERVAL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INTERVAL_RE.exec(adviceText)) !== null) {
    // 日期误报防护：匹配起点前面是「N月 / N年」时，本数字是日期的「日」分量
    // （如「2026年10月13日复查」里的「13日」），不是复查间隔 → 跳过
    const before = adviceText.slice(0, m.index);
    if (/(?:[0-9]+|[一二两三四五六七八九十]+)\s*(?:个?月|年)\s*$/.test(before)) continue;

    const halfAsNumber = m[1] === '半';
    const numText = m[2];
    const unitText = m[3] ?? '';
    const halfSuffix = m[4] === '半';

    let quantity: number;
    if (halfAsNumber) {
      quantity = 0.5; // 「半年复查」：口语=6 个月，按 180 天（spec §5.6 验收口径）
    } else {
      const n = parseCnNumber(numText ?? '');
      if (n == null || n <= 0) continue;
      quantity = n;
    }

    // 个?月 捕获可能带「个」：归一到 UNIT_DAYS 键
    const unitKey = unitText.replace(/^个/, '');
    const unitDays = UNIT_DAYS[unitKey];
    if (!unitDays) continue;

    let intervalDays: number;
    if (halfAsNumber && unitKey === '年') {
      intervalDays = 180; // 半年 = 6 个月
    } else {
      intervalDays = Math.round(quantity * unitDays);
      if (halfSuffix && !halfAsNumber) {
        // 「一年半」「三个半月」：加半个单位（一年半 = 365 + 182 ≈ 548，spec 口径）
        intervalDays = Math.round(quantity * unitDays + unitDays / 2);
      }
    }
    if (intervalDays <= 0 || intervalDays > 3650) continue; // 超 10 年视为噪声

    matches.push({
      dueDate: addDays(encounterDate, intervalDays),
      intervalDays,
      sourceText: m[0].trim(),
    });
  }
  return matches;
}
