import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

// ── Plugins ────────────────────────────────────────────────────────────────────

export const plugins = pgTable('plugins', {
  id: varchar('id', { length: 100 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  version: varchar('version', { length: 20 }).notNull(),
  description: text('description'),
  author: varchar('author', { length: 255 }),
  manifestJson: jsonb('manifest_json').notNull(),
  capabilities: jsonb('capabilities').notNull(),
  isVerified: boolean('is_verified').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ── Plugin Installations ───────────────────────────────────────────────────────

export const pluginInstallations = pgTable('plugin_installations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  pluginId: varchar('plugin_id', { length: 100 })
    .notNull()
    .references(() => plugins.id),
  isEnabled: boolean('is_enabled').default(true),
  configJson: jsonb('config_json'),
  installedAt: timestamp('installed_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ── Relations ──────────────────────────────────────────────────────────────────

export const pluginsRelations = relations(plugins, ({ many }) => ({
  installations: many(pluginInstallations),
}));

export const pluginInstallationsRelations = relations(
  pluginInstallations,
  ({ one }) => ({
    user: one(users, {
      fields: [pluginInstallations.userId],
      references: [users.id],
    }),
    plugin: one(plugins, {
      fields: [pluginInstallations.pluginId],
      references: [plugins.id],
    }),
  }),
);
