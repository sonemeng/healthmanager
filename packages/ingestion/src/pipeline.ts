import type { ClassificationResult, ParseResult, NormalizationResult, PipelineResult } from './types';

// The pipeline orchestrates classify -> parse -> normalize.
// In production, each step runs as a Render Workflow step.
// This module provides the logical composition for testing.

export interface PipelineContext {
  importJobId: string;
  artifactId: string;
  userId: string;
  rawText: string;
  mimeType: string;
}

export interface PipelineStepResult<T> {
  data: T;
  durationMs: number;
}

export async function runStep<T>(
  name: string,
  fn: () => Promise<T>
): Promise<PipelineStepResult<T>> {
  const start = Date.now();
  const data = await fn();
  return { data, durationMs: Date.now() - start };
}
