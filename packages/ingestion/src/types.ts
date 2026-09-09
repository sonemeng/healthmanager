import type { DataCategory, DocumentType } from '@openvitals/common';

export interface RawExtraction {
  analyte: string;
  value: number | null;
  valueText: string | null;
  unit: string | null;
  referenceRangeLow: number | null;
  referenceRangeHigh: number | null;
  referenceRangeText: string | null;
  isAbnormal: boolean | null;
  observedAt: string; // ISO date
  category?: DataCategory;
  metadata?: Record<string, unknown>;
}

export interface ClassificationResult {
  documentType: DocumentType;
  confidence: number;
  reasoning: string;
}

export interface NormalizedObservation {
  metricCode: string;
  category: DataCategory;
  valueNumeric: number | null;
  valueText: string | null;
  unit: string;
  referenceRangeLow: number | null;
  referenceRangeHigh: number | null;
  referenceRangeText: string | null;
  isAbnormal: boolean | null;
  observedAt: Date;
  confidenceScore: number;
  loincCode?: string;
  snomedCode?: string;
  analyte?: string;
}

export interface FlaggedExtraction {
  extraction: RawExtraction;
  reason: 'low_confidence' | 'unmatched_metric' | 'ambiguous_unit' | 'duplicate_candidate';
  details: string;
}

export interface ParseResult {
  extractions: RawExtraction[];
  patientName?: string;
  collectionDate?: string;
  reportDate?: string;
  labName?: string;
  rawMetadata?: Record<string, unknown>;
}

export interface NormalizationResult {
  normalized: NormalizedObservation[];
  flagged: FlaggedExtraction[];
}

export interface PipelineResult {
  classification: ClassificationResult;
  parseResult: ParseResult;
  normalization: NormalizationResult;
}
