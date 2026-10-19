/**
 * 换算留痕的读取与展示（spec 21 §4.9 / D6）。
 *
 * 类型刻意与 `packages/ingestion/src/types.ts` 的 `UnitConversionMeta` 保持同形——
 * apps/web 不依赖 @openvitals/ingestion（会把 worker 的编译链拖进纯前端包），
 * 所以这里重新声明一份。字段改动必须两处同步。
 */
export interface ConversionMeta {
  fromUnit: string;
  toUnit: string;
  multiplier: number;
  offset: number;
  rawValue: number;
  rawRange: { low: number | null; high: number | null } | null;
}

/** 从 observations.metadata_json 里读换算留痕；没有或形状不对都返回 null */
export function readConversion(metadataJson: unknown): ConversionMeta | null {
  if (!metadataJson || typeof metadataJson !== 'object') return null;
  const raw = (metadataJson as { conversion?: unknown }).conversion;
  if (!raw || typeof raw !== 'object') return null;

  const c = raw as Record<string, unknown>;
  if (typeof c.fromUnit !== 'string' || typeof c.toUnit !== 'string') return null;
  if (typeof c.multiplier !== 'number' || typeof c.rawValue !== 'number') return null;

  const range = c.rawRange as { low?: unknown; high?: unknown } | null | undefined;
  const low = typeof range?.low === 'number' ? range.low : null;
  const high = typeof range?.high === 'number' ? range.high : null;

  return {
    fromUnit: c.fromUnit,
    toUnit: c.toUnit,
    multiplier: c.multiplier,
    offset: typeof c.offset === 'number' ? c.offset : 0,
    rawValue: c.rawValue,
    rawRange: low !== null || high !== null ? { low, high } : null,
  };
}

/** 系数展示：×88.4 / ×0.01131；offset 非零时追加「−17.78」 */
function formatFactor(meta: ConversionMeta): string {
  const m = Number(meta.multiplier.toPrecision(4));
  const base = `×${m}`;
  if (!meta.offset) return base;
  const o = Number(meta.offset.toPrecision(4));
  return `${base} ${o < 0 ? '−' : '+'} ${Math.abs(o)}`;
}

/** 原文数值：保留解析出的位数，长尾浮点噪声截到 6 位 */
function formatRawValue(v: number): string {
  const s = String(v);
  const decLen = s.includes('.') ? s.length - s.indexOf('.') - 1 : 0;
  if (decLen > 6) return String(Number(v.toFixed(6)));
  return s;
}

/**
 * 角标悬浮文案：`已换算 · 原文 1.65 mg/dL（×88.4）`。
 * 有报告原文区间时一并给出，便于对照纸质单。
 */
export function conversionTooltip(meta: ConversionMeta): string {
  const raw = formatRawValue(meta.rawValue);
  const range =
    meta.rawRange && (meta.rawRange.low !== null || meta.rawRange.high !== null)
      ? `，原文区间 ${meta.rawRange.low ?? ''}~${meta.rawRange.high ?? ''} ${meta.fromUnit}`
      : '';
  return `已换算 · 原文 ${raw} ${meta.fromUnit}（${formatFactor(meta)}）${range}`;
}
