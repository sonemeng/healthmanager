import type { DocumentType } from '@openvitals/common';

export interface RawPluginExtraction {
  analyte: string;
  value: number | null;
  valueText: string | null;
  unit: string | null;
  referenceRangeLow: number | null;
  referenceRangeHigh: number | null;
  referenceRangeText: string | null;
  isAbnormal: boolean | null;
  observedAt: string;
  metadata?: Record<string, unknown>;
}

export interface ParserPlugin {
  id: string;
  version: string;
  supportedTypes: DocumentType[];

  parse(params: {
    text: string;
    mimeType: string;
    metadata?: Record<string, unknown>;
  }): Promise<{
    extractions: RawPluginExtraction[];
    metadata?: Record<string, unknown>;
  }>;
}
