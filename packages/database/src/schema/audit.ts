import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';

// ── Audit Events ───────────────────────────────────────────────────────────────

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').references(() => users.id),
    actorId: uuid('actor_id'),
    eventType: varchar('event_type', { length: 100 }).notNull(),
    resourceType: varchar('resource_type', { length: 50 }),
    resourceId: uuid('resource_id'),
    detail: jsonb('detail'),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [
    index('audit_events_user_event_type_idx').on(
      table.userId,
      table.eventType,
    ),
    index('audit_events_user_created_idx').on(table.userId, table.createdAt),
  ],
);
