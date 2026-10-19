SET client_encoding = 'UTF8';

-- 0024 · 词库 provenance 与 unit_kind 建模（S0a · 机制 1）
--
-- 目标：让每一条字典区间能回答「哪来的、谁核的、什么单位性质」。
-- 现状（实测 2026-10-19）：metric_definitions 只有 13 列，无任何来源字段；
-- reference_ranges.source 是自由字符串（22 种混杂：标准号 / 医院缩写 / 书名 / 网站名），
-- 无法分级、无法裁决冲突、无法验证严谨性。
--
-- 本迁移只做三件事，不改任何区间数值：
--   1) 加列（source_tier / citation / verified_at / verified_by / unit_kind；
--      学习行另加 observation_id 溯源、conflict_status 冲突标定）
--   2) 按可机器反解的规则打标（WS/T → national_standard，指南 → guideline，
--      通行/教材 → textbook，仪器法 → instrument，检验科/陕HR/上饶HR/auto_* → lab_learned，
--      反解不出的 → unverified）
--   3) unit_kind 按「有单位 / 无单位但有数值区间 / 都无」三分，另对 6 个比值与量表显式标 dimensionless
--
-- 诚实边界：verified_at / verified_by 全部留 NULL。本轮没有任何人逐条核过 177 条，
-- 不能填假值冒充「已核验」。未核验这件事由 source_tier='unverified' + 校验器清单体现。
--
-- 幂等：ADD COLUMN IF NOT EXISTS + 全量重算打标（不是增量累加）。

-- ── 1. 加列 ──────────────────────────────────────────────────────────────────
ALTER TABLE metric_definitions
  ADD COLUMN IF NOT EXISTS source_tier varchar(20),
  ADD COLUMN IF NOT EXISTS citation text,
  ADD COLUMN IF NOT EXISTS verified_at timestamp,
  ADD COLUMN IF NOT EXISTS verified_by varchar(100),
  ADD COLUMN IF NOT EXISTS unit_kind varchar(20);

ALTER TABLE reference_ranges
  ADD COLUMN IF NOT EXISTS source_tier varchar(20),
  ADD COLUMN IF NOT EXISTS citation text,
  ADD COLUMN IF NOT EXISTS verified_at timestamp,
  ADD COLUMN IF NOT EXISTS verified_by varchar(100),
  ADD COLUMN IF NOT EXISTS observation_id uuid REFERENCES observations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conflict_status varchar(20),
  ADD COLUMN IF NOT EXISTS conflict_note text,
  ADD COLUMN IF NOT EXISTS promotion_status varchar(20);

CREATE INDEX IF NOT EXISTS reference_ranges_observation_idx ON reference_ranges (observation_id);

-- ── 2. reference_ranges 打标 ─────────────────────────────────────────────────
-- source 是自由字符串，按前缀/精确值反解；解不出的保持 unverified（不猜）。
-- 只标尚未打标的行（source_tier IS NULL）：让 0025 的「无溯源降级」不会被重跑改回去，
-- 也保证本迁移连跑第二次影响 0 行。
UPDATE reference_ranges
SET source_tier = CASE
      WHEN source LIKE 'WS/T%' OR source LIKE 'GB%' THEN 'national_standard'
      WHEN source LIKE '%指南%' OR source LIKE '%共识%' THEN 'guideline'
      WHEN source LIKE '镜检法通行%' OR source = '通行口径' THEN 'textbook'
      WHEN source LIKE '流式仪器法通行%' THEN 'instrument'
      WHEN source IN ('检验科区间', '陕HR', '上饶HR') THEN 'lab_learned'
      ELSE 'unverified'
    END
WHERE source_tier IS NULL;

-- citation：标准号/指南名/教材名本身就是可追溯引用；学习行与网站来源没有 citation。
UPDATE reference_ranges
SET citation = CASE
      WHEN source_tier IN ('national_standard', 'guideline') THEN source
      WHEN source_tier IN ('textbook', 'instrument') THEN source
      ELSE NULL
    END
WHERE citation IS NULL
  AND source_tier IN ('national_standard', 'guideline', 'textbook', 'instrument');

-- ── 3. metric_definitions 打标 ───────────────────────────────────────────────
-- 字典条目的可信度取它名下最高等级的区间行（national_standard 最优）。
WITH ranked AS (
  SELECT rr.metric_code,
         rr.source_tier,
         rr.citation,
         CASE rr.source_tier
           WHEN 'national_standard' THEN 1
           WHEN 'guideline'         THEN 2
           WHEN 'textbook'          THEN 3
           WHEN 'instrument'        THEN 4
           WHEN 'lab_learned'       THEN 5
           WHEN 'user_input'        THEN 6
           ELSE 9
         END AS rank
  FROM reference_ranges rr
  WHERE rr.source_tier IS NOT NULL
), best AS (
  SELECT DISTINCT ON (metric_code) metric_code, source_tier, citation
  FROM ranked
  ORDER BY metric_code, rank
)
UPDATE metric_definitions m
SET source_tier = b.source_tier,
    citation = b.citation
FROM best b
WHERE m.id = b.metric_code AND m.source_tier IS NULL;

-- 自学习条目：本身就是 lab_learned（无人工来源），必须显式标出，不能混进 unverified。
UPDATE metric_definitions
SET source_tier = 'lab_learned'
WHERE id LIKE 'auto\_%' AND (source_tier IS NULL OR source_tier = 'unverified');

-- 其余（无任何来源线索）→ unverified：允许使用，但优先级最低、UI 显示「来源待补」。
UPDATE metric_definitions SET source_tier = 'unverified' WHERE source_tier IS NULL;

-- ── 4. unit_kind ─────────────────────────────────────────────────────────────
-- 比值/量表/比重/pH 有数值但无量纲，必须先判，否则会被当成「漏填单位」误拦。
UPDATE metric_definitions
SET unit_kind = 'dimensionless'
WHERE id IN (
  'albumin_globulin_ratio', 'ast_alt_ratio', 'bun_creatinine_ratio',
  'specific_gravity', 'strain_score', 'urine_ph'
)
  AND unit_kind IS DISTINCT FROM 'dimensionless';

UPDATE metric_definitions
SET unit_kind = CASE
      WHEN unit IS NOT NULL AND unit <> '' THEN 'quantitative'
      WHEN reference_range_low IS NOT NULL OR reference_range_high IS NOT NULL THEN 'dimensionless'
      ELSE 'qualitative'
    END
WHERE unit_kind IS NULL;

-- ── 5. 一致性自检（迁移内硬断言，失败即中止，避免带病打包）─────────────────
-- psql -v ON_ERROR_STOP=1 下，DO 块抛异常会让整个迁移失败。
DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n FROM metric_definitions WHERE source_tier IS NULL;
  IF n > 0 THEN RAISE EXCEPTION '0024: % metric_definitions rows still have NULL source_tier', n; END IF;

  SELECT count(*) INTO n FROM metric_definitions WHERE unit_kind IS NULL;
  IF n > 0 THEN RAISE EXCEPTION '0024: % metric_definitions rows still have NULL unit_kind', n; END IF;

  SELECT count(*) INTO n
  FROM metric_definitions
  WHERE unit_kind = 'qualitative'
    AND (reference_range_low IS NOT NULL OR reference_range_high IS NOT NULL);
  IF n > 0 THEN RAISE EXCEPTION '0024: % qualitative metrics carry numeric ranges', n; END IF;

  SELECT count(*) INTO n
  FROM metric_definitions
  WHERE unit_kind = 'quantitative' AND (unit IS NULL OR unit = '');
  IF n > 0 THEN RAISE EXCEPTION '0024: % quantitative metrics have no unit', n; END IF;

  SELECT count(*) INTO n FROM reference_ranges WHERE source_tier IS NULL;
  IF n > 0 THEN RAISE EXCEPTION '0024: % reference_ranges rows still have NULL source_tier', n; END IF;
END $$;
