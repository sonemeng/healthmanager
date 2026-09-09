import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';

// ── Feedback ──────────────────────────────────────────────────────────────────

export const feedback = pgTable(
  'feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').references(() => users.id),
    message: text('message').notNull(),
    rating: varchar('rating', { length: 20 }),
    page: varchar('page', { length: 500 }),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [
    index('feedback_user_created_idx').on(table.userId, table.createdAt),
  ],
);
