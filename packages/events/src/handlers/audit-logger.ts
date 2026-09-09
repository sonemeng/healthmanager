import type { AppEvent } from '../types';
import { auditEvents, getDb } from '@openvitals/database';

export function auditLogHandler(event: AppEvent): void {
  void getDb()
    .insert(auditEvents)
    .values({
      userId: event.userId,
      eventType: event.type,
      resourceType: getResourceType(event),
      resourceId: getResourceId(event),
      detail: {
        payload: event.payload,
        metadata: event.metadata ?? null,
      },
      createdAt: event.timestamp,
    })
    .catch((error) => {
      console.error('[audit] Failed to write audit event:', error);
    });
}

function getResourceType(event: AppEvent): string | null {
  if (event.type.startsWith('observation.')) return 'observation';
  if (event.type.startsWith('import.')) return 'import_job';
  if (event.type.startsWith('share.')) return 'share';
  if (event.type.startsWith('ai.')) return 'ai';
  return null;
}

function getResourceId(event: AppEvent): string | null {
  const payload = event.payload as Record<string, unknown>;
  const value =
    payload.observationId ??
    payload.importJobId ??
    payload.grantId ??
    payload.sharePolicyId ??
    payload.insightId;
  return typeof value === 'string' && isUuid(value) ? value : null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
