import {
  pgTable,
  text,
  varchar,
  boolean,
  timestamp,
  integer,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

// ── AI Channels（多渠道，OpenAI 兼容中转站 / Anthropic 原生）────────────────────

export const aiChannels = pgTable(
  'ai_channels',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    baseUrl: text('base_url').notNull(),
    apiKey: text('api_key').notNull(),
    protocol: varchar('protocol', { length: 20 }).default('openai').notNull(),
    modelsCache: jsonb('models_cache'),
    isActive: boolean('is_active').default(false).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => [index('ai_channels_user_id_idx').on(table.userId)],
);

export const aiChannelsRelations = relations(aiChannels, ({ one }) => ({
  user: one(users, {
    fields: [aiChannels.userId],
    references: [users.id],
  }),
}));
