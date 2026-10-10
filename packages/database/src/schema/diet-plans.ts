import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { profiles } from "./profiles";

// ── Diet Plans（AI 饮食清单存档，spec 17 §2）──────────────────────────────────
// 每次生成 = 新 insert（天然版本留痕）；contentJson 为 AI 生成原版，
// editedJson 为用户手动编辑版（null = 未编辑）；展示时 editedJson 优先。

export const dietPlans = pgTable(
  "diet_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    profileId: text("profile_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    // 对应最近一次检查日（YYYY-MM-DD），「随批次存档」的批次键
    batchDate: varchar("batch_date", { length: 10 }).notNull(),
    generatedAt: timestamp("generated_at").defaultNow().notNull(),
    model: varchar("model", { length: 200 }),
    contentJson: jsonb("content_json").notNull(),
    editedJson: jsonb("edited_json"),
    editedAt: timestamp("edited_at"),
    disclaimerText: text("disclaimer_text"),
  },
  (table) => [
    index("diet_plans_user_profile_batch_idx").on(
      table.userId,
      table.profileId,
      table.batchDate,
    ),
  ],
);
