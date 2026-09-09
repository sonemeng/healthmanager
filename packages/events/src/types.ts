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
  | ImportStartedEvent
  | ImportCompletedEvent
  | ImportFailedEvent
  | ShareCreatedEvent
  | ShareAccessedEvent
  | ShareRevokedEvent
  | AIContextBuiltEvent
  | AIInsightGeneratedEvent;

export type AppEventType = AppEvent['type'];
