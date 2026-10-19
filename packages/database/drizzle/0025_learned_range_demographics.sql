SET client_encoding = 'UTF8';

-- 0025 · 学习行人口学回填 + 冲突标定 + 溯源（S0b · 机制 3 / 4.12.5）
--
-- 背景（生产库实测 2026-10-19）：
--   98 条学习行全部 sex IS NULL（ensureLearnedRange 硬编码 sex:null），
--   而 2a 匹配把 null 当「通配所有人」，又优先于国标 2b。
--   后果：creatinine 学习行 41~73（女性值）会让男性 80 µmol/L 判「偏高」，
--   实际国标 57~97 为正常。同类还有 alt / ggt / rbc / hb / hct / uric_acid 等。
--
-- 本迁移做四件事（不动任何区间数值）：
--   1) sex 回填：区间与某性别国标在 5% 容差内吻合 → 填该性别
--   2) 无法定性的（与两性都不吻合 / 与两性都吻合）→ 保持 null 但标 conflicted，交人工
--   3) observation_id 回填：学习行能对上来源观测的，把来源行登记上
--   4) 冲突标定：同 (指标, 单位, 性别) 多行区间差异 >20% → conflicted
--
-- 幂等：所有 UPDATE 都带 `WHERE sex IS NULL` / `WHERE observation_id IS NULL` / 重算 conflicted。

-- ── 1. sex 回填（容差 5%，只承认「恰好一个性别吻合」的行）──────────────────
WITH learned AS (
  SELECT id, metric_code, range_low, range_high
  FROM reference_ranges
  WHERE unit IS NOT NULL AND sex IS NULL
), std AS (
  SELECT metric_code, sex, range_low, range_high
  FROM reference_ranges
  WHERE unit IS NULL AND sex IS NOT NULL
), hit AS (
  SELECT l.id, s.sex
  FROM learned l
  JOIN std s ON s.metric_code = l.metric_code
  WHERE (l.range_low IS NULL OR s.range_low IS NULL
         OR abs(l.range_low - s.range_low) <= 0.05 * abs(s.range_low))
    AND (l.range_high IS NULL OR s.range_high IS NULL
         OR abs(l.range_high - s.range_high) <= 0.05 * abs(s.range_high))
  GROUP BY l.id, s.sex
), uniq AS (
  SELECT id, min(sex) AS sex FROM hit GROUP BY id HAVING count(DISTINCT sex) = 1
)
UPDATE reference_ranges r
SET sex = u.sex
FROM uniq u
WHERE r.id = u.id AND r.sex IS NULL;

-- ── 2. 无法定性的学习行标 conflicted ────────────────────────────────────────
-- 只针对「该指标有分性别国标、且学习行单位与字典单位一致」的行。
-- 单位不同的（如 urine_rbc 学习行 /µL、字典 /HPF）不可比，不应标冲突；
-- 没有分性别国标的指标（如 urine_creatinine 无国标）保持 sex NULL 是正确状态。
UPDATE reference_ranges r
SET conflict_status = 'conflicted',
    conflict_note = '区间与任一性别国标均不吻合（5% 容差），无法自动判定适用人群，需人工确认'
WHERE r.unit IS NOT NULL
  AND r.sex IS NULL
  AND r.conflict_status IS NULL
  AND EXISTS (
    SELECT 1
    FROM reference_ranges s
    JOIN metric_definitions m ON m.id = s.metric_code
    WHERE s.metric_code = r.metric_code
      AND s.unit IS NULL
      AND s.sex IS NOT NULL
      AND m.unit = r.unit
  );

-- ── 3. observation_id 回填（单位已在 0023 归一，可直接等值匹配）─────────────
WITH src AS (
  SELECT DISTINCT ON (r.id) r.id, o.id AS obs_id
  FROM reference_ranges r
  JOIN observations o
    ON o.metric_code = r.metric_code
   AND o.unit = r.unit
   AND o.reference_range_low IS NOT DISTINCT FROM r.range_low
   AND o.reference_range_high IS NOT DISTINCT FROM r.range_high
  WHERE r.unit IS NOT NULL AND r.observation_id IS NULL
  ORDER BY r.id, o.observed_at
)
UPDATE reference_ranges r
SET observation_id = s.obs_id
FROM src s
WHERE r.id = s.id;

-- ── 4. 同 (指标, 单位, 性别) 多行差异 >20% → 全部标 conflicted ─────────────
-- 只跟同性别比：男女区间本就不同，跨性别比较是伪冲突。
WITH pairs AS (
  SELECT a.id AS aid, b.id AS bid
  FROM reference_ranges a
  JOIN reference_ranges b
    ON a.metric_code = b.metric_code
   AND a.unit = b.unit
   AND a.sex IS NOT DISTINCT FROM b.sex
   AND a.id < b.id
  WHERE a.unit IS NOT NULL AND b.unit IS NOT NULL
    AND (
      (a.range_low IS NOT NULL AND b.range_low IS NOT NULL
        AND greatest(abs(a.range_low), abs(b.range_low)) > 0
        AND abs(a.range_low - b.range_low) > 0.2 * greatest(abs(a.range_low), abs(b.range_low)))
      OR
      (a.range_high IS NOT NULL AND b.range_high IS NOT NULL
        AND greatest(abs(a.range_high), abs(b.range_high)) > 0
        AND abs(a.range_high - b.range_high) > 0.2 * greatest(abs(a.range_high), abs(b.range_high)))
    )
)
UPDATE reference_ranges r
SET conflict_status = 'conflicted',
    conflict_note = coalesce(r.conflict_note || '；', '') ||
      '同 (指标, 单位, 性别) 存在差异 >20% 的另一条学习行，未自动择一'
WHERE r.id IN (SELECT aid FROM pairs UNION SELECT bid FROM pairs)
  -- 已标过冲突的行不再重复写（保证连跑第二次影响 0 行）
  AND (r.conflict_status IS NULL OR r.conflict_status <> 'conflicted');

-- ── 5. 无来源观测可溯源的学习行降级为 unverified ────────────────────────────
-- 实测 4 条学习行匹配不到来源观测：
--   · urine_rbc / urine_wbc 的 /µL 0~25 —— source 是「流式仪器法通行（SYSMEX UF-1000i）」，
--     属于字典级仪器法区间（0024 已标 instrument），不是从报告学来的，不需要 observation_id；
--   · auto_1d7oh1o /HPF 0~1、auto_5nvlzq /µL 0~29 —— 真正的 lab_learned 但无来源行，
--     无法验证。按「不可追溯的学习行不得冒充可信来源」降级为 unverified，
--     仍可用于判读（优先级最低），但校验器会把它列进 unverified 清单交人工。
UPDATE reference_ranges
SET source_tier = 'unverified',
    conflict_note = trim(both '；' from coalesce(conflict_note || '；', '') ||
      '历史学习行找不到来源观测，已降级为 unverified，需人工溯源或删除')
WHERE unit IS NOT NULL
  AND source_tier = 'lab_learned'
  AND observation_id IS NULL;

-- ── 6. 自检 ──────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n integer;
BEGIN
  -- 有分性别国标、但学习行仍无 sex 且未标冲突的，不允许存在
  SELECT count(*) INTO n
  FROM reference_ranges r
  WHERE r.unit IS NOT NULL AND r.sex IS NULL AND r.conflict_status IS NULL
    AND EXISTS (
      SELECT 1 FROM reference_ranges s
      JOIN metric_definitions m ON m.id = s.metric_code
      WHERE s.metric_code = r.metric_code AND s.unit IS NULL AND s.sex IS NOT NULL
        AND m.unit = r.unit
    );
  IF n > 0 THEN
    RAISE EXCEPTION '0025: % learned rows still lack sex without conflict flag', n;
  END IF;
END $$;
