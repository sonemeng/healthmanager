import {
  pgTable,
  uuid,
  varchar,
  text,
  date,
  jsonb,
  timestamp,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { profiles } from './profiles';
import { sourceArtifacts, importJobs } from './sources';

// ── Conditions ─────────────────────────────────────────────────────────────────

export const conditions = pgTable('conditions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  profileId: text('profile_id').references(() => profiles.id, {
    onDelete: 'set null',
  }),
  name: varchar('name', { length: 255 }).notNull(),
  code: varchar('code', { length: 20 }),
  codeSystem: varchar('code_system', { length: 20 }),
  severity: varchar('severity', { length: 20 }),
  status: varchar('status', { length: 20 }).default('active'),
  onsetDate: date('onset_date'),
  resolutionDate: date('resolution_date'),
  diagnosedBy: varchar('diagnosed_by', { length: 255 }),
  notes: text('notes'),
  sourceArtifactId: uuid('source_artifact_id').references(
    () => sourceArtifacts.id,
  ),
  importJobId: uuid('import_job_id').references(() => importJobs.id),
  metadataJson: jsonb('metadata_json'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ── Relations ──────────────────────────────────────────────────────────────────

export const conditionsRelations = relations(conditions, ({ one }) => ({
  user: one(users, {
    fields: [conditions.userId],
    references: [users.id],
  }),
  sourceArtifact: one(sourceArtifacts, {
    fields: [conditions.sourceArtifactId],
    references: [sourceArtifacts.id],
  }),
  importJob: one(importJobs, {
    fields: [conditions.importJobId],
    references: [importJobs.id],
  }),
}));
