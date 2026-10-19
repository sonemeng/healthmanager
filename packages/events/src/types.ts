export interface DomainEvent<T extends string = string, P = unknown> {
  type: T;
  payload: P;
  userId: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

// Event type definitions
export type ObservationCreatedEvent = DomainEvent<'observation.created', {
  observationId: string;
  metricCode: string;
  category: string;
  importJobId?: string;
}>;

export type ObservationCorrectedEvent = DomainEvent<'observation.corrected', {
  observationId: string;
  metricCode: string;
  changes: Record<string, { from: unknown; to: unknown }>;
}>;

export type ObservationConfirmedEvent = DomainEvent<'observation.confirmed', {
  observationId: string;
}>;

/**
 * 区间待定被处理（spec 21 S2）。
 * action：keep_blank（确认无区间）/ set（手工补区间）/ rematch（改挂指标）/ keep_blank_batch（批量）。
 */
export type ObservationRangeResolvedEvent = DomainEvent<'observation.range_resolved', {
  observationId?: string;
  importJobId?: string;
  action: 'keep_blank' | 'set' | 'rematch' | 'keep_blank_batch';
  metricCode?: string;
  from?: string | null;
  to?: string;
  rangeLow?: number | null;
  rangeHigh?: number | null;
  remembered?: boolean;
  recomputed?: boolean;
  count?: number;
}>;

export type ImportStartedEvent = DomainEvent<'import.started', {
  importJobId: string;
  artifactId: string;
}>;

export type ImportCompletedEvent = DomainEvent<'import.completed', {
  importJobId: string;
  observationCount: number;
}>;

export type ImportFailedEvent = DomainEvent<'import.failed', {
  importJobId: string;
  error: string;
}>;

export type ShareCreatedEvent = DomainEvent<'share.created', {
  sharePolicyId: string;
  grantId: string;
  recipientEmail?: string;
}>;

export type ShareAccessedEvent = DomainEvent<'share.accessed', {
  grantId: string;
  accessorEmail?: string;
}>;

export type ShareRevokedEvent = DomainEvent<'share.revoked', {
  grantId: string;
}>;

export type AIContextBuiltEvent = DomainEvent<'ai.context_built', {
  categories: string[];
  observationCount: number;
  tokenCount: number;
}>;

export type AIInsightGeneratedEvent = DomainEvent<'ai.insight_generated', {
  insightId: string;
  model: string;
}>;

export type AppEvent =
  | ObservationCreatedEvent
  | ObservationCorrectedEvent
  | ObservationConfirmedEvent
  | ObservationRangeResolvedEvent
  | ImportStartedEvent
  | ImportCompletedEvent
  | ImportFailedEvent
  | ShareCreatedEvent
  | ShareAccessedEvent
  | ShareRevokedEvent
  | AIContextBuiltEvent
  | AIInsightGeneratedEvent;

export type AppEventType = AppEvent['type'];
