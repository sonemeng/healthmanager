import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return '-';
  return num.toLocaleString();
}

export function formatLargeNumber(num: number): string {
  if (num >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(2) + 'B';
  }
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(2) + 'M';
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(1) + 'K';
  }
  return num.toLocaleString();
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatPercentage(value: number | null | undefined, decimals: number = 0): string {
  if (value === null || value === undefined) return '-';
  return `${value.toFixed(decimals)}%`;
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.substring(0, length) + '...';
}

/**
 * Format a date string as a human-readable relative time (e.g. "5m ago", "in 2h").
 */
export function getRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const absSec = Math.floor(Math.abs(diffMs) / 1000);

  const format = (value: number, unit: string) =>
    diffMs < 0 ? `in ${value}${unit}` : `${value}${unit} ago`;

  if (absSec < 60) return diffMs >= 0 ? 'just now' : format(absSec, 's');
  const min = Math.floor(absSec / 60);
  if (min < 60) return format(min, 'm');
  const hr = Math.floor(min / 60);
  if (hr < 24) return format(hr, 'h');
  const day = Math.floor(hr / 24);
  if (day < 7) return format(day, 'd');
  const week = Math.floor(day / 7);
  if (week < 5) return format(week, 'w');
  const month = Math.floor(day / 30);
  if (month < 12) return format(month, 'mo');
  const year = Math.floor(day / 365);
  return format(year, 'y');
}

export const pluralize = (
  word: string,
  count: number,
  options: {
    plural?: string;
  } = {}
) => {
  if (count === 1) {
    return word;
  }
  if (options.plural) {
    return options.plural;
  }
  if (word.endsWith('y')) {
    return `${word.slice(0, -1)}ies`;
  }

  return `${word}s`;
};

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const DURATION_METRICS = new Set(['sleep_duration']);

/**
 * 换算值的显示（spec 21 §4.11 / D8）。
 *
 * 为什么不用「固定两位小数」：1.65 mg/dL 乘 0.01131 = 0.01866，固定两位 → 0.02，
 * 误差 +7.2%，对低值指标足以跨过参考下限。规则改成按**有效数字**：
 *  - |v| < 1 → 两位有效数字（0.01866 → 0.019，误差 1.8%）
 *  - |v| ≥ 1 → 四位有效数字（145.86 → 145.9；5922.2 → 5922）
 * 存储层不 round（real 的 7 位有效数字够用，提前 round 会让 backfill 不可逆）。
 */
export function formatConvertedNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (value === 0) return '0';
  const abs = Math.abs(value);
  const digits = abs < 1 ? 2 : 4;
  const fixed = value.toPrecision(digits);
  const numeric = Number(fixed);
  // 极大/极小值保留 toPrecision 的写法：Number() 会转成科学计数法，反而更难读
  if (numeric !== 0 && (Math.abs(numeric) >= 1e21 || Math.abs(numeric) < 1e-6)) return fixed;
  return String(numeric);
}

export function formatObsValue(
  metricCode: string,
  valueNumeric: number | null | undefined,
  valueText: string | null | undefined,
  displayPrecision?: number | null,
  options?: { converted?: boolean },
): string {
  if (valueNumeric != null && DURATION_METRICS.has(metricCode)) {
    return formatDuration(valueNumeric);
  }
  if (valueNumeric != null) {
    // 换算值：走有效数字规则（与值的来源无关，只看是否来自换算）
    if (options?.converted) return formatConvertedNumber(valueNumeric);
    // 化验单原文优先：保留原始值的有效小数位，不用字典精度截断（1.27 不显示为 1.3）
    const raw = String(valueNumeric);
    const decLen = raw.includes('.') ? raw.length - raw.indexOf('.') - 1 : 0;
    // 浮点噪声兜底：小数位异常长时截到 6 位并去尾零
    if (decLen > 6) {
      const trimmed = Number(valueNumeric.toFixed(6));
      return String(trimmed);
    }
    // 字典精度只用于补足最短小数位，不丢弃原始精度
    if (displayPrecision != null && decLen < displayPrecision) {
      return valueNumeric.toFixed(displayPrecision);
    }
    return raw;
  }
  return valueText ?? '—';
}

export function isDurationMetric(metricCode: string): boolean {
  return DURATION_METRICS.has(metricCode);
}

export function formatLabValue(value: number | null | undefined, unit?: string): string {
  if (value === null || value === undefined) return '-';
  const formatted = value % 1 === 0 ? value.toString() : value.toFixed(2);
  return unit ? `${formatted} ${unit}` : formatted;
}
