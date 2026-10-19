import {
  pgTable,
  varchar,
  text,
  real,
  integer,
  jsonb,
  serial,
  unique,
  index,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { profiles } from "./profiles";
import { observations } from "./observations";

// ── Metric Definitions ─────────────────────────────────────────────────────────

export const metricDefinitions = pgTable("metric_definitions", {
  id: varchar("id", { length: 50 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 50 }).notNull(),
  unit: varchar("unit", { length: 50 }),
  loincCode: varchar("loinc_code", { length: 20 }),
  snomedCode: varchar("snomed_code", { length: 20 }),
  aliases: jsonb("aliases"),
  referenceRangeLow: real("reference_range_low"),
  referenceRangeHigh: real("reference_range_high"),
  referenceRangeText: text("reference_range_text"),
  description: text("description"),
  displayPrecision: integer("display_precision"),
  sortOrder: integer("sort_order").default(0),
  // provenance（spec 21 · S0a）：来源等级 / 可追溯引用 / 人工核验记录 / 单位性质。
  // source_tier 缺失时按 unverified 处理（可用，但优先级最低、UI 显示「来源待补」）。
  sourceTier: varchar("source_tier", { length: 20 }),
  citation: text("citation"),
  // citation_kind（spec 21 · S5.0 / 0026）：cited（有文献引证）/ exempt（经人判定无通行
  // 参考区间）/ NULL（待补）。与 source_tier 联合判定「来源待补」：
  //   source_tier='unverified' AND citation IS NULL AND citation_kind IS NULL
  citationKind: varchar("citation_kind", { length: 12 }),
  verifiedAt: timestamp("verified_at"),
  verifiedBy: varchar("verified_by", { length: 100 }),
  unitKind: varchar("unit_kind", { length: 20 }),
});

// ── Reference Ranges ──────────────────────────────────────────────────────────

// spec 19（v0.1.14）：unit 列区分行类型——
//   NULL  = 字典基准单位行（国标/通行口径，数值在 metric_definitions.unit 下）
//   非 NULL = 学习行（该指标的区间以这个单位为准，来自用户确认的报告原文；
//            source = 互认标识如「陕HR」或「检验科区间」）
// 唯一约束扩至 unit/low/high：同一 (metric, sex, age) 的国标行与学习行、
// 不同检验科给出不同单位区间的学习行均可并存（幂等由「先查后插」保证）。
export const referenceRanges = pgTable(
  "reference_ranges",
  {
    id: serial("id").primaryKey(),
    metricCode: varchar("metric_code", { length: 50 })
      .notNull()
      .references(() => metricDefinitions.id),
    sex: varchar("sex", { length: 10 }),
    ageMin: integer("age_min"),
    ageMax: integer("age_max"),
    rangeLow: real("range_low"),
    rangeHigh: real("range_high"),
    rangeText: text("range_text"),
    source: varchar("source", { length: 100 }),
    unit: varchar("unit", { length: 50 }),
    // provenance（spec 21 · S0a/S0b）
    sourceTier: varchar("source_tier", { length: 20 }),
    citation: text("citation"),
    // citation_kind（spec 21 · S5.0 / 0026）：同 metric_definitions，见上。
    citationKind: varchar("citation_kind", { length: 12 }),
    verifiedAt: timestamp("verified_at"),
    verifiedBy: varchar("verified_by", { length: 100 }),
    // 学习行溯源：这条区间来自哪条观测（点开可回到原报告）
    observationId: uuid("observation_id").references(() => observations.id, {
      onDelete: "set null",
    }),
    // 冲突标定：同 (指标, 单位, 性别) 多来源区间差异 >20%，不自动择一
    conflictStatus: varchar("conflict_status", { length: 20 }),
    conflictNote: text("conflict_note"),
    // 晋升通道：同 key 有 ≥3 份独立报告区间一致 → 提为字典候选，人工批准后升 textbook
    promotionStatus: varchar("promotion_status", { length: 20 }),
  },
  (table) => [
    unique("reference_ranges_metric_sex_age_unit_uniq")
      .on(
        table.metricCode,
        table.sex,
        table.ageMin,
        table.ageMax,
        table.unit,
        table.rangeLow,
        table.rangeHigh,
      )
      .nullsNotDistinct(),
    index("reference_ranges_metric_code_idx").on(table.metricCode),
    index("reference_ranges_observation_idx").on(table.observationId),
  ],
);

// ── Optimal Ranges ───────────────────────────────────────────────────────────

export const optimalRanges = pgTable(
  "optimal_ranges",
  {
    id: serial("id").primaryKey(),
    metricCode: varchar("metric_code", { length: 50 })
      .notNull()
      .references(() => metricDefinitions.id),
    sex: varchar("sex", { length: 10 }),
    ageMin: integer("age_min"),
    ageMax: integer("age_max"),
    rangeLow: real("range_low"),
    rangeHigh: real("range_high"),
    rangeText: text("range_text"),
    source: varchar("source", { length: 255 }),
    sourceUrl: text("source_url"),
  },
  (table) => [
    unique("optimal_ranges_metric_sex_age_uniq").on(
      table.metricCode,
      table.sex,
      table.ageMin,
      table.ageMax,
    ),
    index("optimal_ranges_metric_code_idx").on(table.metricCode),
  ],
);

// ── User Optimal Range Overrides ─────────────────────────────────────────────

export const userOptimalRanges = pgTable(
  "user_optimal_ranges",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    metricCode: varchar("metric_code", { length: 50 })
      .notNull()
      .references(() => metricDefinitions.id),
    rangeLow: real("range_low"),
    rangeHigh: real("range_high"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    unique("user_optimal_ranges_user_profile_metric_uniq").on(
      table.userId,
      table.profileId,
      table.metricCode,
    ),
  ],
);

// ── User Dashboard Metrics（健康大屏关注指标）─────────────────────────────────

export const userDashboardMetrics = pgTable(
  "user_dashboard_metrics",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    metricCode: varchar("metric_code", { length: 50 })
      .notNull()
      .references(() => metricDefinitions.id),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    unique("user_dashboard_metrics_user_profile_metric_uniq").on(
      table.userId,
      table.profileId,
      table.metricCode,
    ),
    index("user_dashboard_metrics_idx").on(table.userId, table.profileId),
  ],
);

// ── Unit Conversions ───────────────────────────────────────────────────────────

export const unitConversions = pgTable(
  "unit_conversions",
  {
    id: serial("id").primaryKey(),
    fromUnit: varchar("from_unit", { length: 50 }).notNull(),
    toUnit: varchar("to_unit", { length: 50 }).notNull(),
    metricCode: varchar("metric_code", { length: 50 }).references(
      () => metricDefinitions.id,
    ),
    multiplier: real("multiplier").notNull(),
    offset: real("offset").notNull().default(0),
  },
  (table) => [
    unique("unit_conversions_from_to_metric_uniq").on(
      table.fromUnit,
      table.toUnit,
      table.metricCode,
    ),
  ],
);
