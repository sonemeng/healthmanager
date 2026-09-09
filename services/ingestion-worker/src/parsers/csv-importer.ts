import type { WorkflowContext } from '../workflow';
import type { ParseResult } from '@openvitals/ingestion';

export async function parseCsvImport(ctx: WorkflowContext): Promise<ParseResult> {
  console.log(`[csv-importer] Parsing CSV for artifact=${ctx.artifactId}`);

  return {
    extractions: [],
    rawMetadata: {
      parser: 'csv-importer',
      version: '0.1.0',
      needsReview: true,
      reviewReason: 'CSV import parsing is not implemented yet.',
    },
  };
}
