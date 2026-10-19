// 批次对比共享类型（spec 20 §3.3，从 compare/page.tsx 抽离，结构零变化）。
// page.tsx re-export 保持既有 `from "./page"` 引用兼容。
export type CompareMetricRow = {
  metricCode: string;
  metricName: string;
  category: string;
  sortOrder: number | null;
  displayPrecision: number | null;
  value: number | null;
  valueText: string | null;
  unit: string | null;
  isAbnormal: boolean | null;
  referenceRangeLow: number | null;
  referenceRangeHigh: number | null;
  presence: "both" | "new" | "missing";
  prevDate: string | null;
  prevValue: number | null;
  prevUnit: string | null;
  prevValueText: string | null;
  prevIsAbnormal: boolean | null;
  delta: number | null;
  deltaPercent: number | null;
  direction: "up" | "down" | "flat" | null;
  unitIncomparable: boolean;
  /** 本次值是否来自单位换算（spec 21 §15.7 S5.5 P1）：决定格式化精度与「换算自」列 */
  converted?: boolean;
  /** 换算前原始单位（如 mg/dL）；未换算为 null */
  fromUnit?: string | null;
  prevConverted?: boolean;
  prevFromUnit?: string | null;
};

export type CompareBatch = {
  date: string;
  daysSincePrev: number | null;
  metrics: CompareMetricRow[];
};
