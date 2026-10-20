SET client_encoding = 'UTF8';

-- 0027 · 补齐 24 条「有基准区间却没有 reference_ranges 行」的字典条目（v0.1.27）
--
-- 现象（空库全量迁移实测 2026-10-20，verify:clean-install）：
--   154 个字典条目里 24 条名下**没有任何 reference_ranges 行**，0024 的等级推断只看区间行，
--   于是它们在全新安装的库里被判成 source_tier='unverified'，校验器 R8 报「来源待补」24 条。
--   开发机真实库看不出这个问题：那 24 条被用户报告学成的 lab_learned 行兜住了。
--
-- 根因：0018 第 3 段把这批指标的 unit 与基准区间改成了中国口径（写进 metric_definitions），
--   但第 6 段只为其中 88 条插了国标行，这批漏插。基准列有值、区间表没行 —— 两处不同步。
--
-- 处置依据：19-附录-字典中国化全量对照表-20261012.md（159 条全部定稿：✅111 换值/➖48 置空）。
--   A 段 16 条 —— 附录给了中国口径，且字典基准列已有值 → **从基准列派生**区间行。
--       刻意不重抄数值：数值只有一处真源（metric_definitions），将来改值只需改一处。
--       等级按来源实况：WS/T 405/404.6 十二条 national_standard；
--       球蛋白/间接胆红素/UACR/胱抑素C 四条为通行口径与推算项，如实标 textbook
--       （不为它们伪造标准号背书）。
--   B 段  8 条 —— 附录明确「不编数值」（方法/仪器依赖）：标 citation_kind='exempt' +
--       一句可复核的豁免依据，source_tier 保持 unverified（rank 9 是最低语义，动它等于动判读优先级）。
--       与 0026 的 X 类同一套处理方式，不新增机制。
--
-- 幂等：A 段 ON CONFLICT DO NOTHING（唯一约束含 low/high，重复跑不产生新行）；
--       B 段与字典 UPDATE 都带条件，连跑第二次 0 行。

-- ── A. 16 条：派生区间行（unit 留 NULL = 字典基准单位行，与 0018 第 6 段同口径）──
INSERT INTO reference_ranges
  (metric_code, sex, age_min, age_max, range_low, range_high, range_text,
   source, source_tier, citation, citation_kind, verified_at, verified_by)
SELECT
  m.id,
  NULL::varchar,
  18,
  NULL::integer,
  m.reference_range_low,
  m.reference_range_high,
  m.reference_range_text,
  v.source,
  v.tier,
  v.citation,
  'cited',
  now(),
  'rule:derive-from-dictionary'
FROM metric_definitions m
JOIN (VALUES
  -- 血常规（WS/T 405-2012《血细胞分析参考区间》）
  ('neutrophils_abs'::varchar, 'WS/T 405-2012'::varchar, 'national_standard'::varchar,
   'WS/T 405-2012《血细胞分析参考区间》：成人中性粒细胞绝对值'::text),
  ('lymphocytes_abs', 'WS/T 405-2012', 'national_standard',
   'WS/T 405-2012《血细胞分析参考区间》：成人淋巴细胞绝对值'),
  ('monocytes_abs', 'WS/T 405-2012', 'national_standard',
   'WS/T 405-2012《血细胞分析参考区间》：成人单核细胞绝对值'),
  ('eosinophils_abs', 'WS/T 405-2012', 'national_standard',
   'WS/T 405-2012《血细胞分析参考区间》：成人嗜酸性粒细胞绝对值'),
  ('basophils_abs', 'WS/T 405-2012', 'national_standard',
   'WS/T 405-2012《血细胞分析参考区间》：成人嗜碱性粒细胞绝对值'),
  ('neutrophils_pct', 'WS/T 405-2012', 'national_standard',
   'WS/T 405-2012《血细胞分析参考区间》：成人中性粒细胞百分比'),
  ('lymphocytes_pct', 'WS/T 405-2012', 'national_standard',
   'WS/T 405-2012《血细胞分析参考区间》：成人淋巴细胞百分比'),
  ('monocytes_pct', 'WS/T 405-2012', 'national_standard',
   'WS/T 405-2012《血细胞分析参考区间》：成人单核细胞百分比'),
  ('eosinophils_pct', 'WS/T 405-2012', 'national_standard',
   'WS/T 405-2012《血细胞分析参考区间》：成人嗜酸性粒细胞百分比'),
  ('basophils_pct', 'WS/T 405-2012', 'national_standard',
   'WS/T 405-2012《血细胞分析参考区间》：成人嗜碱性粒细胞百分比'),
  -- 代谢（WS/T 404.6-2015 第 6 部分：血清总钙、无机磷、镁、铁）
  ('magnesium', 'WS/T 404.6-2015', 'national_standard',
   'WS/T 404.6-2015《临床常用生化检验项目参考区间 第6部分：血清总钙、无机磷、镁、铁》：成人血清镁'),
  ('phosphate', 'WS/T 404.6-2015', 'national_standard',
   'WS/T 404.6-2015《临床常用生化检验项目参考区间 第6部分：血清总钙、无机磷、镁、铁》：成人血清无机磷'),
  -- 通行口径 / 推算项（不伪造标准号背书）
  ('globulin', '通行口径', 'textbook',
   '国内化验单通行口径 20~40 g/L（19-附录-字典中国化全量对照表 2026-10-12 代谢节；球蛋白为总蛋白减白蛋白的推算项，WS/T 404.2 未单列）'),
  ('indirect_bilirubin', '通行口径', 'textbook',
   '国内化验单通行口径 1.7~10.2 μmol/L（19-附录-字典中国化全量对照表 2026-10-12 肝节；间接胆红素为总胆红素减直接胆红素的推算项，无独立 WS/T 区间）'),
  ('uacr', '通行口径', 'textbook',
   '通行口径 UACR <30 mg/g（正常白蛋白尿；19-附录-字典中国化全量对照表 2026-10-12 肾节）'),
  ('cystatin_c', '通行口径', 'textbook',
   '通行口径 0.55~1.15 mg/L（19-附录-字典中国化全量对照表 2026-10-12 肾节；本机报告原文 0.54~1.15，各平台略有差异）')
) AS v(id, source, tier, citation) ON v.id = m.id
WHERE m.reference_range_low IS NOT NULL OR m.reference_range_high IS NOT NULL
ON CONFLICT DO NOTHING;

-- 字典条目等级同步：取「名下最高等级的区间行」与 0024 的口径一致（0024 只跑一次，此处显式写）。
UPDATE metric_definitions m
SET source_tier = v.tier,
    citation = v.citation,
    citation_kind = 'cited',
    verified_at = now(),
    verified_by = 'rule:derive-from-dictionary'
FROM (VALUES
  ('neutrophils_abs'::varchar, 'national_standard'::varchar, 'WS/T 405-2012《血细胞分析参考区间》：成人中性粒细胞绝对值'::text),
  ('lymphocytes_abs', 'national_standard', 'WS/T 405-2012《血细胞分析参考区间》：成人淋巴细胞绝对值'),
  ('monocytes_abs', 'national_standard', 'WS/T 405-2012《血细胞分析参考区间》：成人单核细胞绝对值'),
  ('eosinophils_abs', 'national_standard', 'WS/T 405-2012《血细胞分析参考区间》：成人嗜酸性粒细胞绝对值'),
  ('basophils_abs', 'national_standard', 'WS/T 405-2012《血细胞分析参考区间》：成人嗜碱性粒细胞绝对值'),
  ('neutrophils_pct', 'national_standard', 'WS/T 405-2012《血细胞分析参考区间》：成人中性粒细胞百分比'),
  ('lymphocytes_pct', 'national_standard', 'WS/T 405-2012《血细胞分析参考区间》：成人淋巴细胞百分比'),
  ('monocytes_pct', 'national_standard', 'WS/T 405-2012《血细胞分析参考区间》：成人单核细胞百分比'),
  ('eosinophils_pct', 'national_standard', 'WS/T 405-2012《血细胞分析参考区间》：成人嗜酸性粒细胞百分比'),
  ('basophils_pct', 'national_standard', 'WS/T 405-2012《血细胞分析参考区间》：成人嗜碱性粒细胞百分比'),
  ('magnesium', 'national_standard', 'WS/T 404.6-2015《临床常用生化检验项目参考区间 第6部分：血清总钙、无机磷、镁、铁》：成人血清镁'),
  ('phosphate', 'national_standard', 'WS/T 404.6-2015《临床常用生化检验项目参考区间 第6部分：血清总钙、无机磷、镁、铁》：成人血清无机磷'),
  ('globulin', 'textbook', '国内化验单通行口径 20~40 g/L（19-附录-字典中国化全量对照表 2026-10-12 代谢节；球蛋白为总蛋白减白蛋白的推算项，WS/T 404.2 未单列）'),
  ('indirect_bilirubin', 'textbook', '国内化验单通行口径 1.7~10.2 μmol/L（19-附录-字典中国化全量对照表 2026-10-12 肝节；间接胆红素为总胆红素减直接胆红素的推算项，无独立 WS/T 区间）'),
  ('uacr', 'textbook', '通行口径 UACR <30 mg/g（正常白蛋白尿；19-附录-字典中国化全量对照表 2026-10-12 肾节）'),
  ('cystatin_c', 'textbook', '通行口径 0.55~1.15 mg/L（19-附录-字典中国化全量对照表 2026-10-12 肾节；本机报告原文 0.54~1.15，各平台略有差异）')
) AS v(id, tier, citation)
WHERE v.id = m.id;

-- ── B. 8 条：无通行区间，把「为什么没有」写成可统计的数据（不编数值）──────────
UPDATE metric_definitions
SET citation_kind = 'exempt',
    citation = CASE id
      WHEN 'cholinesterase'  THEN '方法依赖：比色法与速率法数值相差数十倍，无统一参考区间，以报告单为准'
      WHEN 'fructosamine'    THEN '方法依赖：不同检测系统的参考区间差异大，以报告单为准'
      WHEN 'pct'             THEN '仪器依赖：各血液分析仪的血小板压积参考区间差异大，以报告单为准'
      WHEN 'pdw'             THEN '仪器依赖：各血液分析仪的血小板分布宽度参考区间差异大，以报告单为准'
      WHEN 'plcc'            THEN '仪器依赖：各血液分析仪的大血小板数目参考区间差异大，以报告单为准'
      WHEN 'plcr'            THEN '仪器依赖：各血液分析仪的大血小板比率参考区间差异大，以报告单为准'
      WHEN 'rdw_sd'          THEN '仪器依赖：各厂商 RDW-SD 算法与参考区间不同，以报告单为准'
      WHEN 'urine_creatinine' THEN '尿肌酐浓度随尿量大幅波动，单次尿无参考区间意义（判读看 UACR），以报告单为准'
      ELSE citation
    END,
    verified_at = now(),
    verified_by = 'rule:no-reference-standard'
WHERE id IN (
    'cholinesterase', 'fructosamine', 'pct', 'pdw', 'plcc', 'plcr', 'rdw_sd', 'urine_creatinine'
  )
  AND citation_kind IS NULL;

-- ── C. 迁移内硬断言（只写不变式，不写会腐烂的总数）───────────────────────────
DO $$
DECLARE
  n integer;
BEGIN
  -- C1: A 段 16 条必须都已有区间行，且行上带等级与认领类型
  SELECT count(*) INTO n
  FROM (VALUES
    ('neutrophils_abs'), ('lymphocytes_abs'), ('monocytes_abs'), ('eosinophils_abs'),
    ('basophils_abs'), ('neutrophils_pct'), ('lymphocytes_pct'), ('monocytes_pct'),
    ('eosinophils_pct'), ('basophils_pct'), ('magnesium'), ('phosphate'),
    ('globulin'), ('indirect_bilirubin'), ('uacr'), ('cystatin_c')
  ) AS v(id)
  WHERE NOT EXISTS (
    SELECT 1 FROM reference_ranges r
    WHERE r.metric_code = v.id AND r.source_tier IS NOT NULL AND r.citation_kind IS NOT NULL
  );
  IF n > 0 THEN
    RAISE EXCEPTION '0027: % dictionary entries still have no provenance-carrying reference_ranges row', n;
  END IF;

  -- C2: 24 条整体不得再落在「来源待补」三条件里（校验器 R8 会归零）
  SELECT count(*) INTO n
  FROM metric_definitions
  WHERE id IN (
    'neutrophils_abs', 'lymphocytes_abs', 'monocytes_abs', 'eosinophils_abs',
    'basophils_abs', 'neutrophils_pct', 'lymphocytes_pct', 'monocytes_pct',
    'eosinophils_pct', 'basophils_pct', 'magnesium', 'phosphate',
    'globulin', 'indirect_bilirubin', 'uacr', 'cystatin_c',
    'cholinesterase', 'fructosamine', 'pct', 'pdw', 'plcc', 'plcr', 'rdw_sd', 'urine_creatinine'
  )
    AND source_tier = 'unverified' AND citation IS NULL AND citation_kind IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION '0027: % of the 24 dictionary entries still lack provenance', n;
  END IF;
END $$;
