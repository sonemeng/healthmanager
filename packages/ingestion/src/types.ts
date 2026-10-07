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
  observedAt: string | null; // ISO date; null when the source has no usable date
  /**
   * 从 analyte 中剥离出的括号内容（缩写/英文名等），如「糖链抗原125(CA125)」→「CA125」。
   * 只作溯源记录，**不参与匹配判定**。（spec 13 C2）
   */
  analyteNote?: string;
  /**
   * 检验结果互认标识，如「陕HR」（陕西省互认）、「9-HR」（九省区互认）。
   * 只作溯源记录，**不参与匹配判定**；可反推出具机构所在省/互认范围。（spec 13 C2）
   */
  interopMark?: string;
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
  observedAtIsFallback?: boolean;
  confidenceScore: number;
  loincCode?: string;
  snomedCode?: string;
  analyte?: string;
  /** 从 analyte 剥离出的括号内容（溯源用，落 observations.metadata_json） */
  analyteNote?: string;
  /** 检验结果互认标识（如 陕HR / 9-HR），溯源用，落 observations.metadata_json */
  interopMark?: string;
  /**
   * 区间对应性门禁拦下时的原因（R2）：报告未印区间、字典兜底区间与观测单位不符
   * → 区间已置空。落 observations.metadata_json，供事后审计「这条为什么没有区间」。
   */
  gateReason?: string;
}

export interface FlaggedExtraction {
  extraction: RawExtraction;
  reason: 'low_confidence' | 'unmatched_metric' | 'ambiguous_unit' | 'duplicate_candidate' | 'range_unit_mismatch';
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

export type PendingRecordCandidate =
  | {
      id: string;
      kind: 'medication';
      status: 'pending' | 'confirmed' | 'rejected';
      name: string;
      dosage?: string;
      frequency?: string;
      indication?: string;
      startDate?: string;
    }
  | {
      id: string;
      kind: 'condition';
      status: 'pending' | 'confirmed' | 'rejected';
      name: string;
      severity?: 'mild' | 'moderate' | 'severe';
      onsetDate?: string;
      notes?: string;
    }
  | {
      id: string;
      kind: 'encounter';
      status: 'pending' | 'confirmed' | 'rejected';
      type: 'checkup' | 'specialist' | 'urgent_care' | 'emergency' | 'telehealth' | 'lab_visit' | 'imaging' | 'dental' | 'therapy' | 'other';
      encounterDate: string;
      provider?: string;
      facility?: string;
      chiefComplaint?: string;
      summary?: string;
    };

export interface NormalizationResult {
  normalized: NormalizedObservation[];
  flagged: FlaggedExtraction[];
}

export interface PipelineResult {
  classification: ClassificationResult;
  parseResult: ParseResult;
  normalization: NormalizationResult;
}
