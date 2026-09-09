export { eventBus } from './bus';
export * from './types';
export { auditLogHandler } from './handlers/audit-logger';

import { eventBus } from './bus';
import { auditLogHandler } from './handlers/audit-logger';
import type { AppEvent } from './types';

const globalForEvents = globalThis as typeof globalThis & {
  __openVitalsAuditHandlerRegistered?: boolean;
};

if (!globalForEvents.__openVitalsAuditHandlerRegistered) {
  eventBus.onAll(auditLogHandler);
  globalForEvents.__openVitalsAuditHandlerRegistered = true;
}

export function emitEvent(event: AppEvent): void {
  eventBus.emit(event);
}
