import type { HealthStatus } from "@/components/health/status-badge";

export function deriveStatus(obs: {
  isAbnormal?: boolean | null;
  referenceRangeLow?: number | null;
  referenceRangeHigh?: number | null;
  valueNumeric?: number | null;
}): HealthStatus {
  if (obs.isAbnormal === true) {
    if (
      obs.valueNumeric != null &&
      obs.referenceRangeLow != null &&
      obs.referenceRangeHigh != null
    ) {
      const distFromLow = obs.referenceRangeLow - obs.valueNumeric;
      const distFromHigh = obs.valueNumeric - obs.referenceRangeHigh;
      const rangeSpan = obs.referenceRangeHigh - obs.referenceRangeLow;
      if (
        rangeSpan > 0 &&
        (distFromLow > rangeSpan * 0.5 || distFromHigh > rangeSpan * 0.5)
      ) {
        return "critical";
      }
    }
    return "warning";
  }
  return "normal";
}

export type AbnormalityDirection = "high" | "low" | null;

/**
 * 由观测值 + 参考区间推导异常方向。
 * 无区间时方向未知（返回 null，文案退化为「异常」）——不再一律显示「偏高」。
 */
export function deriveDirection(obs: {
  valueNumeric?: number | null;
  referenceRangeLow?: number | null;
  referenceRangeHigh?: number | null;
  isAbnormal?: boolean | null;
}): AbnormalityDirection {
  if (obs.valueNumeric == null) return null;
  const low = obs.referenceRangeLow ?? null;
  const high = obs.referenceRangeHigh ?? null;
  if (high != null && obs.valueNumeric > high) return "high";
  if (low != null && obs.valueNumeric < low) return "low";
  return null;
}

/**
 * 统一异常/方向文案（替换各处写死的「偏高」）。
 *  critical + high → 严重偏高；critical + low → 严重偏低；
 *  warning  + high → 偏高；    warning  + low → 偏低；
 *  方向未知（null） → 异常
 */
export function getAbnormalityLabel(
  level: "critical" | "warning" | string | null | undefined,
  direction: AbnormalityDirection,
): string {
  if (direction === "high") return level === "critical" ? "严重偏高" : "偏高";
  if (direction === "low") return level === "critical" ? "严重偏低" : "偏低";
  return "异常";
}

export function formatRelativeTime(date: Date | string): string {
  const now = Date.now();
  const then =
    typeof date === "string" ? new Date(date).getTime() : date.getTime();
  const diffMs = now - then;
  const absSec = Math.floor(Math.abs(diffMs) / 1000);

  if (absSec < 60) return "just now";
  const min = Math.floor(absSec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  // For older dates, use formatted date
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export type OptimalStatus = "optimal" | "suboptimal" | "unknown";

export function deriveOptimalStatus(obs: {
  valueNumeric?: number | null;
  optimalRangeLow?: number | null;
  optimalRangeHigh?: number | null;
}): OptimalStatus {
  if (obs.valueNumeric == null) return "unknown";
  if (obs.optimalRangeLow == null && obs.optimalRangeHigh == null)
    return "unknown";

  const val = obs.valueNumeric;
  if (obs.optimalRangeLow != null && val < obs.optimalRangeLow)
    return "suboptimal";
  if (obs.optimalRangeHigh != null && val > obs.optimalRangeHigh)
    return "suboptimal";
  return "optimal";
}

export function formatRange(
  low: number | null | undefined,
  high: number | null | undefined,
  unit?: string | null,
): string {
  const u = unit ?? "";
  // 中文语境用「~」连接区间（en-dash 在部分中文字体下显示异常，用户实测观感如乱码）
  if (low != null && high != null) return `${low}~${high} ${u}`.trim();
  if (low != null) return `> ${low} ${u}`.trim();
  if (high != null) return `< ${high} ${u}`.trim();
  return "—";
}
