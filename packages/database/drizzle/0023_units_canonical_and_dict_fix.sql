SET client_encoding = 'UTF8';

-- 0023 · 单位写法归一 + 字典单位选错修正（S0a · D8 第二层 + D6 前置）
--
-- 背景（生产库实测 2026-10-19，用真实 canonicalUnit() 逐行比对，非推测）：
--   metric_definitions.unit 25 行、reference_ranges.unit 32 行、observations.unit 62 行
--   不是规范形。同一 µmol/L 在库里存在三种写法：
--     µ (U+00B5 MICRO SIGN) / μ (U+03BC GREEK MU) / ASCII u
--   解析链路靠 canonicalUnit() 现场归一才没出事，但任何绕过它的字符串比较都会失配
--   （批次对比「不可比」7 项的根因）。本迁移把存量统一到 canonicalUnit() 的输出。
--
-- 两处「字典单位选错」（不是写法问题，是数量级问题）：
--   1) fructosamine：字典 mmol/L，但唯一一份报告印的是 μmol/L（值 340.2、原文上限 286）。
--      果糖胺国内实验室以 µmol/L 报告；写成 mmol/L 会让 340.2 判成「高 340 倍」。
--   2) vldl_cholesterol：定量指标但单位漏填（reference_range_text 已注明"中国极少单列"）。
--      VLDL-C 与 TG 同单位，国内报告用 mmol/L；补单位不涉及任何区间数值。
--
-- 幂等：每条都用 `WHERE unit = <旧值>` 精确匹配，重复执行影响 0 行。

-- ── 1. 字典单位选错修正 ──────────────────────────────────────────────────────
UPDATE metric_definitions
SET unit = 'µmol/L'
WHERE id = 'fructosamine' AND unit = 'mmol/L';

UPDATE metric_definitions
SET unit = 'mmol/L'
WHERE id = 'vldl_cholesterol' AND (unit IS NULL OR unit = '');

-- ── 2. 合并「归一后会重复」的学习行 ─────────────────────────────────────────
-- 实测：creatinine 同时有 `umol/L 41~73`（上饶HR）与 `μmol/L 41~73`（陕HR）——
-- 唯一约束把它们当成两个不同单位，归一后会撞 reference_ranges_metric_sex_age_unit_uniq。
-- 处理：保留 id 最小的一条，把被并行的来源写进 conflict_note（不丢溯源线索），再删重复。
-- psql -f 逐语句自动提交，ON COMMIT DROP 会在建表后立刻被删；用显式先删再建保证可重复执行。
-- conflict_note 由 0024 正式建模，这里提前加（IF NOT EXISTS）以便合并重复时留痕。
ALTER TABLE reference_ranges ADD COLUMN IF NOT EXISTS conflict_note text;
DROP TABLE IF EXISTS _unit_alias;
CREATE TEMP TABLE _unit_alias (old_unit varchar(50), new_unit varchar(50));
INSERT INTO _unit_alias (old_unit, new_unit) VALUES
  ('',                NULL),
  ('/ul',             '/µL'),
  ('/μL',             '/µL'),
  ('umol/L',          'µmol/L'),
  ('μmol/L',          'µmol/L'),
  ('μg/L',            'µg/L'),
  ('mg/l',            'mg/L'),
  ('pg/ml',           'pg/mL'),
  ('ml/min/1.73m2',   'mL/min/1.73m2'),
  ('K/uL',            '10^9/L');

WITH mapped AS (
  SELECT r.id, r.metric_code, r.sex, r.age_min, r.age_max,
         r.range_low, r.range_high, r.source,
         coalesce(a.new_unit, r.unit) AS new_unit
  FROM reference_ranges r
  LEFT JOIN _unit_alias a ON r.unit = a.old_unit
  WHERE r.unit IS NOT NULL
), grouped AS (
  SELECT metric_code, sex, age_min, age_max, new_unit, range_low, range_high,
         min(id) AS keep_id,
         string_agg(DISTINCT source, ' / ') AS sources,
         count(*) AS n
  FROM mapped
  GROUP BY metric_code, sex, age_min, age_max, new_unit, range_low, range_high
  HAVING count(*) > 1
)
UPDATE reference_ranges r
SET conflict_note = trim(both '；' from coalesce(r.conflict_note || '；', '') ||
      '单位写法归一后与另一条学习行重复，已合并；来源：' || g.sources)
FROM grouped g
WHERE r.id = g.keep_id;

WITH mapped AS (
  SELECT r.id, r.metric_code, r.sex, r.age_min, r.age_max,
         r.range_low, r.range_high,
         coalesce(a.new_unit, r.unit) AS new_unit
  FROM reference_ranges r
  LEFT JOIN _unit_alias a ON r.unit = a.old_unit
  WHERE r.unit IS NOT NULL
), ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY metric_code, sex, age_min, age_max, new_unit, range_low, range_high
           ORDER BY id
         ) AS rn
  FROM mapped
)
DELETE FROM reference_ranges WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- ── 3. 写法归一（三张表共用同一张映射表）────────────────────────────────────
UPDATE metric_definitions m
SET unit = a.new_unit
FROM _unit_alias a
WHERE m.unit = a.old_unit;

UPDATE reference_ranges r
SET unit = a.new_unit
FROM _unit_alias a
WHERE r.unit = a.old_unit;

UPDATE observations o
SET unit = a.new_unit
FROM _unit_alias a
WHERE o.unit = a.old_unit;

-- 观测行的「原文单位」列同步归一？不改：original_unit 是报告原文快照，保留原样可回溯。
