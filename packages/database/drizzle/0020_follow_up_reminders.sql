-- 0020 · 医嘱复查提醒表（spec 20 §5.2，v0.1.16 P4）
-- 背景：现有复查体系按指标周期推算（retest.getRecommendations）；
--       本表存「医生医嘱」来源的复查提醒（如「三个月后复查肾功能」），
--       两类来源在首页复查提醒卡合并展示。
-- 通道说明：desktop 迁移按文件名跟踪（desktop-state.json 的 appliedMigrations），不进 drizzle journal（同 0018/0019）。
-- 幂等性：CREATE TABLE/INDEX IF NOT EXISTS，可重复执行。
-- 区分自动/手动行：interval_days 非空 = 解析自动生成；空 = 手动补录（无解析间隔）。

SET client_encoding = 'UTF8';

CREATE TABLE IF NOT EXISTS follow_up_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id text REFERENCES profiles(id) ON DELETE SET NULL,
  encounter_id uuid NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  due_date date NOT NULL,
  source_text text,
  interval_days integer,
  status varchar(20) NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS follow_up_reminders_user_status_due_idx
  ON follow_up_reminders(user_id, status, due_date);--> statement-breakpoint
