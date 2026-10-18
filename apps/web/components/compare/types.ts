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
};

export type CompareBatch = {
  date: string;
  daysSincePrev: number | null;
  metrics: CompareMetricRow[];
};
