import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

// ── Insights ───────────────────────────────────────────────────────────────────

export const insights = pgTable('insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 20 }).notNull(),
  content: text('content').notNull(),
  generatedBy: varchar('generated_by', { length: 100 }).notNull(),
  sourceObservationIds: jsonb('source_observation_ids'),
  sourceCategories: jsonb('source_categories'),
  contextTokenCount: integer('context_token_count'),
  isDismissed: boolean('is_dismissed').default(false),
  metadataJson: jsonb('metadata_json'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ── Relations ──────────────────────────────────────────────────────────────────

export const insightsRelations = relations(insights, ({ one }) => ({
  user: one(users, {
    fields: [insights.userId],
    references: [users.id],
  }),
}));
