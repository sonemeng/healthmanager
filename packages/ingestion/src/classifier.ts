import type { ClassificationResult } from './types';

// Classification logic - wraps AI call, applied in the ingestion worker
export async function classifyDocument(
  text: string,
  mimeType: string
): Promise<ClassificationResult> {
  // Quick heuristics before AI
  if (mimeType === 'text/csv') {
    return { documentType: 'csv_export', confidence: 0.95, reasoning: 'CSV file detected by MIME type' };
  }

  // AI-based classification will be called from the worker
  // This is a placeholder that returns unknown
  return {
    documentType: 'unknown',
    confidence: 0,
    reasoning: 'AI classification not yet wired',
  };
}
