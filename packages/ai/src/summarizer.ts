export interface SummarizationResult {
  text: string;
  observationIds: string[];
  tokenEstimate: number;
  tier: 1 | 2 | 3 | 4;
}

// Tier 1: Always include - abnormal values, most recent per metric, significant changes, active meds/conditions
// Tier 2: Include if budget allows - last 90 days, recent adherence logs, encounter summaries
// Tier 3: Summarize if budget allows - older stable values compressed to trend statements
// Tier 4: Drop - oldest stable normals, redundant daily readings, dismissed insights

export function compressTrendToSummary(
  metricCode: string,
  values: { value: number; date: Date }[],
  unit: string
): string {
  if (values.length === 0) return '';
  const sorted = [...values].sort((a, b) => a.date.getTime() - b.date.getTime());
  const min = Math.min(...sorted.map(v => v.value));
  const max = Math.max(...sorted.map(v => v.value));
  const latest = sorted[sorted.length - 1]!;
  const earliest = sorted[0]!;
  const startDate = earliest.date.toISOString().split('T')[0];
  const endDate = latest.date.toISOString().split('T')[0];
  return `${metricCode}: stable across ${values.length} readings from ${startDate} to ${endDate}, range ${min}-${max} ${unit}, most recent: ${latest.value} ${unit}`;
}
