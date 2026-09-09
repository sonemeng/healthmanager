import {
  pgTable,
  text,
  varchar,
  boolean,
  timestamp,
  date,
  real,
  integer,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

// ── Profiles（家庭档案：单账号多成员）───────────────────────────────────────────

export const profiles = pgTable(
  'profiles',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    gender: varchar('gender', { length: 10 }),
    birthDate: date('birth_date'),
    heightCm: real('height_cm'),
    weightKg: real('weight_kg'),
    avatarColor: text('avatar_color'),
    isDefault: boolean('is_default').default(false).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => [index('profiles_user_id_idx').on(table.userId)],
);

export const profilesRelations = relations(profiles, ({ one }) => ({
  user: one(users, {
    fields: [profiles.userId],
    references: [users.id],
  }),
}));
