/**
 * 「0018 之前」的 metric_definitions 列投影（v0.1.27 · 07 号坑 19/20）
 *
 * 为什么需要另一份表定义：主程序在新装时会把字典播种**提前**到 0018 之前（外键需要行先存在）。
 * 而 drizzle 的 INSERT 会为**整张表的所有列**生成占位（未给的列写 `default`），其中
 * source_tier / citation / verified_at / verified_by / unit_kind（0024 加）、
 * citation_kind（0026 加）在那一刻还不存在，PostgreSQL 直接报
 * `column "source_tier" of relation "metric_definitions" does not exist`。
 *
 * 所以这里显式声明「0000–0017 这一段已经存在的 13 列」——只给字典播种用。
 * provenance 列一律由 0024/0026 在播种之后回填（这正是把 seed 提前要换来的东西：
 * 回填终于打在真实行上，而不是空表）。
 *
 * 维护约定：
 *   - 新增的列若由 0018 及之后的迁移创建，**不要**加到这里；
 *   - 只有 0017 之前就存在的列才属于这里；
 *   - 若将来有新迁移在 0018 之前改本表结构，必须同步这里（verify:clean-install 会兜住）。
 */
import { integer, jsonb, pgTable, real, text, varchar } from 'drizzle-orm/pg-core';

export const metricDefinitionsBefore0018 = pgTable('metric_definitions', {
  id: varchar('id', { length: 50 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  category: varchar('category', { length: 50 }).notNull(),
  unit: varchar('unit', { length: 50 }),
  loincCode: varchar('loinc_code', { length: 20 }),
  snomedCode: varchar('snomed_code', { length: 20 }),
  aliases: jsonb('aliases'),
  referenceRangeLow: real('reference_range_low'),
  referenceRangeHigh: real('reference_range_high'),
  referenceRangeText: text('reference_range_text'),
  description: text('description'),
  displayPrecision: integer('display_precision'),
  sortOrder: integer('sort_order').default(0),
});
