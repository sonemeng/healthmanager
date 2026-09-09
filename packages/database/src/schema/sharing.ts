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

// ── Share Policies ─────────────────────────────────────────────────────────────

export const sharePolicies = pgTable('share_policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  templateId: varchar('template_id', { length: 50 }),
  categories: jsonb('categories').notNull(),
  accessLevel: varchar('access_level', { length: 20 }).notNull().default('view'),
  dateFrom: timestamp('date_from'),
  dateTo: timestamp('date_to'),
  expiresAt: timestamp('expires_at'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ── Share Templates ────────────────────────────────────────────────────────────

export const shareTemplates = pgTable('share_templates', {
  id: varchar('id', { length: 50 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  categories: jsonb('categories').notNull(),
  defaultAccessLevel: varchar('default_access_level', { length: 20 })
    .notNull()
    .default('view'),
  sortOrder: integer('sort_order').default(0),
});

// ── Access Grants ──────────────────────────────────────────────────────────────

export const accessGrants = pgTable('access_grants', {
  id: uuid('id').primaryKey().defaultRandom(),
  sharePolicyId: uuid('share_policy_id')
    .notNull()
    .references(() => sharePolicies.id, { onDelete: 'cascade' }),
  recipientEmail: varchar('recipient_email', { length: 255 }),
  recipientUserId: text('recipient_user_id').references(() => users.id),
  token: varchar('token', { length: 255 }).unique().notNull(),
  hasPassword: boolean('has_password').default(false),
  passwordHash: text('password_hash'),
  isActive: boolean('is_active').default(true),
  lastAccessedAt: timestamp('last_accessed_at'),
  accessCount: integer('access_count').default(0),
  revokedAt: timestamp('revoked_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ── Relations ──────────────────────────────────────────────────────────────────

export const sharePoliciesRelations = relations(
  sharePolicies,
  ({ one, many }) => ({
    user: one(users, {
      fields: [sharePolicies.userId],
      references: [users.id],
    }),
    accessGrants: many(accessGrants),
  }),
);

export const accessGrantsRelations = relations(accessGrants, ({ one }) => ({
  sharePolicy: one(sharePolicies, {
    fields: [accessGrants.sharePolicyId],
    references: [sharePolicies.id],
  }),
  recipientUser: one(users, {
    fields: [accessGrants.recipientUserId],
    references: [users.id],
  }),
}));
