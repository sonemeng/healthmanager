import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  date,
  jsonb,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { profiles } from './profiles';
import { sourceArtifacts, importJobs } from './sources';

// ── Medications ────────────────────────────────────────────────────────────────

export const medications = pgTable('medications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  profileId: text('profile_id').references(() => profiles.id, {
    onDelete: 'set null',
  }),
  name: varchar('name', { length: 255 }).notNull(),
  genericName: varchar('generic_name', { length: 255 }),
  category: varchar('category', { length: 50 }).default('prescription'),
  dosage: varchar('dosage', { length: 100 }),
  frequency: varchar('frequency', { length: 100 }),
  route: varchar('route', { length: 50 }),
  prescriber: varchar('prescriber', { length: 255 }),
  indication: text('indication'),
  startDate: date('start_date'),
  endDate: date('end_date'),
  isActive: boolean('is_active').default(true),
  status: varchar('status', { length: 20 }).default('manual'),
  sourceArtifactId: uuid('source_artifact_id').references(
    () => sourceArtifacts.id,
  ),
  importJobId: uuid('import_job_id').references(() => importJobs.id),
  notes: text('notes'),
  metadataJson: jsonb('metadata_json'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ── Medication Logs ────────────────────────────────────────────────────────────

export const medicationLogs = pgTable('medication_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  medicationId: uuid('medication_id')
    .notNull()
    .references(() => medications.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  logDate: date('log_date').notNull(),
  taken: boolean('taken').notNull(),
  timeOfDay: varchar('time_of_day', { length: 20 }),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

// ── Relations ──────────────────────────────────────────────────────────────────

export const medicationsRelations = relations(
  medications,
  ({ one, many }) => ({
    user: one(users, {
      fields: [medications.userId],
      references: [users.id],
    }),
    sourceArtifact: one(sourceArtifacts, {
      fields: [medications.sourceArtifactId],
      references: [sourceArtifacts.id],
    }),
    importJob: one(importJobs, {
      fields: [medications.importJobId],
      references: [importJobs.id],
    }),
    logs: many(medicationLogs),
  }),
);

export const medicationLogsRelations = relations(
  medicationLogs,
  ({ one }) => ({
    medication: one(medications, {
      fields: [medicationLogs.medicationId],
      references: [medications.id],
    }),
    user: one(users, {
      fields: [medicationLogs.userId],
      references: [users.id],
    }),
  }),
);
