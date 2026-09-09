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

// ── Encounters ─────────────────────────────────────────────────────────────────

export const encounters = pgTable('encounters', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  profileId: text('profile_id').references(() => profiles.id, {
    onDelete: 'set null',
  }),
  type: varchar('type', { length: 50 }).notNull(),
  provider: varchar('provider', { length: 255 }),
  facility: varchar('facility', { length: 255 }),
  encounterDate: date('encounter_date').notNull(),
  chiefComplaint: text('chief_complaint'),
  summary: text('summary'),
  sourceArtifactId: uuid('source_artifact_id').references(
    () => sourceArtifacts.id,
  ),
  importJobId: uuid('import_job_id').references(() => importJobs.id),
  metadataJson: jsonb('metadata_json'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ── Relations ──────────────────────────────────────────────────────────────────

export const encountersRelations = relations(encounters, ({ one }) => ({
  user: one(users, {
    fields: [encounters.userId],
    references: [users.id],
  }),
  sourceArtifact: one(sourceArtifacts, {
    fields: [encounters.sourceArtifactId],
    references: [sourceArtifacts.id],
  }),
  importJob: one(importJobs, {
    fields: [encounters.importJobId],
    references: [importJobs.id],
  }),
}));
