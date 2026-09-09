import { getDb } from '@openvitals/database/client';
import { importJobs } from '@openvitals/database';
import { eq } from 'drizzle-orm';
import { emitEvent } from '@openvitals/events';
import { classify } from './steps/classify';
import { parse } from './steps/parse';
import { normalize } from './steps/normalize';
import { materialize } from './steps/materialize';

export interface WorkflowContext {
  importJobId: string;
  artifactId: string;
  userId: string;
}

export async function processWorkflow(ctx: WorkflowContext): Promise<void> {
  console.log(`[workflow] Starting ingestion for job=${ctx.importJobId}`);
  const db = getDb();
  emitEvent({
    type: 'import.started',
    payload: { importJobId: ctx.importJobId, artifactId: ctx.artifactId },
    userId: ctx.userId,
    timestamp: new Date(),
  });

  try {
    // Step 1: Classify the document
    const classification = await classify(ctx);
    console.log(`[workflow] Classified as ${classification.documentType} (${classification.confidence})`);

    // If confidence too low, mark for review and stop
    if (classification.confidence < 0.7) {
      console.log(`[workflow] Low confidence, marking for review`);
      await db.update(importJobs)
        .set({ status: 'review_needed', needsReview: true })
        .where(eq(importJobs.id, ctx.importJobId));
      return;
    }

    // Step 2: Parse the document
    const parseResult = await parse(ctx, classification.documentType);
    console.log(`[workflow] Extracted ${parseResult.extractions.length} results`);
    const parseNeedsReview = parseResult.rawMetadata?.needsReview === true;

    if (parseResult.extractions.length === 0) {
      const reviewReason = typeof parseResult.rawMetadata?.reviewReason === 'string'
        ? parseResult.rawMetadata.reviewReason
        : null;
      await db.update(importJobs)
        .set({
          status: parseNeedsReview ? 'review_needed' : 'completed',
          extractionCount: 0,
          needsReview: parseNeedsReview,
          errorMessage: reviewReason,
          completedAt: parseNeedsReview ? null : new Date(),
        })
        .where(eq(importJobs.id, ctx.importJobId));
      return;
    }

    // Step 3: Normalize extractions
    const normalization = await normalize(ctx, parseResult.extractions);
    console.log(`[workflow] Normalized ${normalization.normalized.length}, flagged ${normalization.flagged.length}`);

    // Step 4: Materialize to database
    await materialize(ctx, normalization, { forceReview: parseNeedsReview });
    console.log(`[workflow] Materialized. Job complete.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[workflow] Failed for job=${ctx.importJobId}:`, message);

    await db.update(importJobs)
      .set({ status: 'failed', errorMessage: message })
      .where(eq(importJobs.id, ctx.importJobId));

    emitEvent({
      type: 'import.failed',
      payload: { importJobId: ctx.importJobId, error: message },
      userId: ctx.userId,
      timestamp: new Date(),
    });
  }
}
