export interface MetricRegistration {
  code: string;
  name: string;
  category: string;
  unit: string;
  aliases?: string[];
  referenceRangeLow?: number;
  referenceRangeHigh?: number;
  description?: string;
  loincCode?: string;
}

export function defineMetric(metric: MetricRegistration): MetricRegistration {
  return metric;
}

export function defineMetrics(metrics: MetricRegistration[]): MetricRegistration[] {
  return metrics;
}
