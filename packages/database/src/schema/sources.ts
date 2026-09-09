import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  real,
  jsonb,
  unique,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { profiles } from './profiles';

// ── Data Sources ───────────────────────────────────────────────────────────────

export const dataSources = pgTable('data_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  provider: varchar('provider', { length: 255 }),
  isActive: boolean('is_active').default(true),
  metadataJson: jsonb('metadata_json'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ── Source Artifacts ────────────────────────────────────────────────────────────

export const sourceArtifacts = pgTable(
  'source_artifacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    dataSourceId: uuid('data_source_id').references(() => dataSources.id),
    fileName: varchar('file_name', { length: 500 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    fileSize: integer('file_size').notNull(),
    contentHash: varchar('content_hash', { length: 64 }).notNull(),
    blobPath: text('blob_path').notNull(),
    rawTextExtracted: text('raw_text_extracted'),
    classifiedType: varchar('classified_type', { length: 50 }),
    classificationConfidence: real('classification_confidence'),
    metadataJson: jsonb('metadata_json'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => [
    unique('source_artifacts_user_content_hash_uniq').on(
      table.userId,
      table.contentHash,
    ),
  ],
);

// ── Import Jobs ────────────────────────────────────────────────────────────────

export const importJobs = pgTable('import_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  profileId: text('profile_id').references(() => profiles.id, {
    onDelete: 'set null',
  }),
  sourceArtifactId: uuid('source_artifact_id')
    .notNull()
    .references(() => sourceArtifacts.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  classifiedType: varchar('classified_type', { length: 50 }),
  classificationConfidence: real('classification_confidence'),
  parserId: varchar('parser_id', { length: 100 }),
  parserVersion: varchar('parser_version', { length: 20 }),
  extractionCount: integer('extraction_count').default(0),
  needsReview: boolean('needs_review').default(false),
  errorMessage: text('error_message'),
  errorDetailJson: jsonb('error_detail_json'),
  startedAt: timestamp('started_at'),
  classifyCompletedAt: timestamp('classify_completed_at'),
  parseCompletedAt: timestamp('parse_completed_at'),
  normalizeCompletedAt: timestamp('normalize_completed_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ── Relations ──────────────────────────────────────────────────────────────────

export const dataSourcesRelations = relations(dataSources, ({ one, many }) => ({
  user: one(users, {
    fields: [dataSources.userId],
    references: [users.id],
  }),
  sourceArtifacts: many(sourceArtifacts),
}));

export const sourceArtifactsRelations = relations(
  sourceArtifacts,
  ({ one, many }) => ({
    user: one(users, {
      fields: [sourceArtifacts.userId],
      references: [users.id],
    }),
    dataSource: one(dataSources, {
      fields: [sourceArtifacts.dataSourceId],
      references: [dataSources.id],
    }),
    importJobs: many(importJobs),
  }),
);

export const importJobsRelations = relations(importJobs, ({ one }) => ({
  user: one(users, {
    fields: [importJobs.userId],
    references: [users.id],
  }),
  sourceArtifact: one(sourceArtifacts, {
    fields: [importJobs.sourceArtifactId],
    references: [sourceArtifacts.id],
  }),
}));
