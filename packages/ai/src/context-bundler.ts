import type { DataCategory } from '@openvitals/common';

export interface ContextBundleParams {
  userId: string;
  categories?: DataCategory[];
  dateRange?: { start?: Date; end?: Date };
  maxTokens: number;
  summarizationPolicy: 'recent_detail' | 'trends_only' | 'comprehensive';
}

export interface ContextSection {
  category: DataCategory;
  content: string;
  observationIds: string[];
  tokenEstimate: number;
}

export interface ContextBundle {
  sections: ContextSection[];
  totalTokenEstimate: number;
  observationCount: number;
  sourceObservationIds: string[];
  categories: DataCategory[];
  assembledAt: Date;
  summary: string;
}

// Rough token estimation: ~4 tokens per word
function estimateTokens(text: string): number {
  return Math.ceil(text.split(/\s+/).length * 1.3);
}

export function formatObservationForContext(obs: {
  metricCode: string;
  valueNumeric?: number | null;
  valueText?: string | null;
  unit?: string | null;
  observedAt: Date;
  isAbnormal?: boolean | null;
  referenceRangeLow?: number | null;
  referenceRangeHigh?: number | null;
}): string {
  const value = obs.valueNumeric != null ? `${obs.valueNumeric}` : obs.valueText ?? 'N/A';
  const unit = obs.unit ?? '';
  const abnormal = obs.isAbnormal ? ' [ABNORMAL]' : '';
  const range = obs.referenceRangeLow != null && obs.referenceRangeHigh != null
    ? ` (ref: ${obs.referenceRangeLow}-${obs.referenceRangeHigh} ${unit})`
    : '';
  const date = obs.observedAt.toISOString().split('T')[0];
  return `${obs.metricCode}: ${value} ${unit}${range}${abnormal} (${date})`;
}

export function buildContextSummary(bundle: ContextBundle): string {
  const catList = bundle.categories.join(', ');
  return `Context: ${bundle.observationCount} observations across ${catList}. Assembled at ${bundle.assembledAt.toISOString()}.`;
}

// The actual bundle building requires database access,
// so the full implementation will be in the tRPC router.
// This module provides the formatting and estimation utilities.
export { estimateTokens };
