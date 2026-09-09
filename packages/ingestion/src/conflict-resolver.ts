export interface ExistingObservation {
  id: string;
  metricCode: string;
  observedAt: Date;
  dataSourceId: string | null;
  status: string;
  valueNumeric: number | null;
}

export type ConflictAction =
  | { type: 'skip'; reason: string }
  | { type: 'create'; reason: string }
  | { type: 'flag_duplicate'; existingId: string; reason: string };

export function resolveConflict(
  incoming: { metricCode: string; observedAt: Date; dataSourceId?: string | null },
  existing: ExistingObservation[]
): ConflictAction {
  if (existing.length === 0) {
    return { type: 'create', reason: 'No existing observation for this metric and date' };
  }

  // Same metric + same date + same source = idempotent skip
  const sameSource = existing.find(e =>
    e.dataSourceId === incoming.dataSourceId &&
    e.metricCode === incoming.metricCode &&
    e.observedAt.getTime() === incoming.observedAt.getTime()
  );
  if (sameSource) {
    return { type: 'skip', reason: 'Idempotent: same metric, date, and source already exists' };
  }

  // Same metric + same date + different source = flag as duplicate candidate
  const sameMetricDate = existing.find(e =>
    e.metricCode === incoming.metricCode &&
    e.observedAt.getTime() === incoming.observedAt.getTime()
  );
  if (sameMetricDate) {
    return {
      type: 'flag_duplicate',
      existingId: sameMetricDate.id,
      reason: 'Same metric and date from a different source — duplicate candidate',
    };
  }

  return { type: 'create', reason: 'No conflict detected' };
}
