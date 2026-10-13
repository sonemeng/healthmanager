import {
  pgTable,
  uuid,
  varchar,
  text,
  date,
  integer,
  jsonb,
  timestamp,
  index,
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

// ── Follow-up Reminders（医嘱复查提醒，spec 20 §5.2，v0.1.16 P4）──────────────
// 来源分两类，与「按指标周期推算」的 retest.getRecommendations 互补：
//   自动行：从医嘱文本解析（interval_days 非空，source_text 为命中原文）；
//   手动行：用户补录（interval_days 为空，source_text 可为备注）。
// 状态机：pending（待复查）→ done（已完成）/ dismissed（不再提醒）。

export const followUpReminders = pgTable(
  'follow_up_reminders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    profileId: text('profile_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    encounterId: uuid('encounter_id')
      .notNull()
      .references(() => encounters.id, { onDelete: 'cascade' }),
    dueDate: date('due_date').notNull(),
    sourceText: text('source_text'),
    intervalDays: integer('interval_days'),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => [
    index('follow_up_reminders_user_status_due_idx').on(
      table.userId,
      table.status,
      table.dueDate,
    ),
  ],
);
