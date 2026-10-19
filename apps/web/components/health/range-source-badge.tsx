import { cn } from '@/lib/utils';

/**
 * 参考区间来源徽标（spec 21 §15.5.1 / S5.3）。
 *
 * 一个组件，三处接入（词库列表、词库详情、检验详情）——不要各写一套，
 * 否则四态判据会在不同页面漂移。
 *
 * 四态（自上而下短路，与 §15.5.1 表格一致）：
 *   ① 已核验   citationKind='cited'      → citation 首段；悬浮给全文 + 核验日期
 *   ② 已豁免   citationKind='exempt'     → 「以报告单为准」
 *   ③ 报告单学习 tier='lab_learned'      → 「报告单学习」；悬浮给来源（哪家医院）+ 报告日期
 *   ④ 待补     tier='unverified' && citationKind IS NULL → 「来源待补」（琥珀**文字**，不是徽标）
 *
 * 为什么 ③ 必须单列：实测 92 条学习行区间的 citation 全是空的，若不单列，
 * 它们会全部显示成「来源待补」，把真正要处理的条目淹掉（§15.5.1 注）。
 *
 * 为什么 ④ 用文字不用徽标：徽标语义是「要你处理」；而「来源待补」的处理入口在
 * **词库页**（S5.2 认领），不在当前报告/检验页——在这个页面上它只是「知会」。
 * 颜色沿用全站纪律（琥珀 = 需留意；中性灰 = 正常信息），不引入新色。
 */
export interface RangeSourceBadgeProps {
  tier: string | null;
  citationKind: 'cited' | 'exempt' | null;
  citation: string | null;
  source: string | null;
  verifiedAt?: Date | string | null;
  className?: string;
}

/** citation 首段：优先取「：」前的一段（如「WS/T 404.2-2012 表1」），过长再截断 */
function citationLead(citation: string): string {
  const head = citation.split(/[：:]/, 1)[0]!.trim();
  const text = head.length > 0 ? head : citation.trim();
  return text.length > 18 ? `${text.slice(0, 17)}…` : text;
}

function formatVerified(v: Date | string | null | undefined): string {
  if (!v) return '';
  const d = typeof v === 'string' ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function RangeSourceBadge({
  tier,
  citationKind,
  citation,
  source,
  verifiedAt,
  className,
}: RangeSourceBadgeProps) {
  // ① 已核验
  if (citationKind === 'cited') {
    if (!citation) return null;
    const verified = formatVerified(verifiedAt);
    return (
      <span
        className={cn('whitespace-nowrap font-mono text-[10px] text-neutral-500', className)}
        title={verified ? `${citation}\n核验日期 ${verified}` : citation}
      >
        {citationLead(citation)}
      </span>
    );
  }

  // ② 已豁免（经人判定无通行参考区间）
  if (citationKind === 'exempt') {
    return (
      <span
        className={cn('whitespace-nowrap font-mono text-[10px] text-neutral-400', className)}
        title={citation ?? '经人判定无通行参考区间，以报告单为准'}
      >
        以报告单为准
      </span>
    );
  }

  // ③ 报告单学习（靠 observation_id 溯源，本身不需要 citation）
  if (tier === 'lab_learned') {
    const verified = formatVerified(verifiedAt);
    return (
      <span
        className={cn('whitespace-nowrap font-mono text-[10px] text-neutral-500', className)}
        title={[source ? `来源：${source}` : '来源：报告单', verified ? `报告日期 ${verified}` : '']
          .filter(Boolean)
          .join('\n')}
      >
        报告单学习
      </span>
    );
  }

  // ④ 待补（三条件联合判定已由调用方/后端折算；此处 tier='unverified' 且无 citationKind）
  if (tier === 'unverified') {
    return (
      <span
        className={cn('whitespace-nowrap font-mono text-[10px] text-amber-600', className)}
        title="这条区间的来源尚未核验；认领入口在词库页"
      >
        来源待补
      </span>
    );
  }

  return null;
}
