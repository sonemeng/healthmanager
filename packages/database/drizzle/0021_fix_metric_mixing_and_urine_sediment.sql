SET client_encoding = 'UTF8';

-- 0021 · 指标串项根治 + 尿沉渣条目补齐（2026-10-18）
--
-- 背景（真实数据取证）：
--   rbc 名下混了 7 个不同检验项（红细胞计数 / 尿沉渣红细胞 / MCH / 异形红细胞率 /
--   有核红细胞比率 / 有核红细胞计数），wbc 名下混了 5 个（白细胞计数 / 尿沉渣白细胞 /
--   白细胞团 / 尿白细胞酯酶），另有自学习条目把「非透明管型」挂到「透明管型」、
--   「非鳞状上皮细胞」挂到「鳞状上皮细胞」。共 4 个 code、18 条观测串项。
--   匹配器侧已加「限定词闸 + 单位平分裁决」（packages/ingestion/src/normalizer.ts），
--   本迁移负责：补齐缺失条目 + 修正历史数据 + 清掉被串项污染的学习行。
--
-- 条目与区间依据：
--   · 血常规：WS/T 405-2012（男 4.3~5.8、女 3.8~5.1 ×10¹²/L；MCH 27~34 pg）
--   · 尿沉渣：无国标（《吴阶平泌尿外科学》明确"尚无国际或国内标准化的参考区间"），
--     采用公开通行口径并标注来源：
--       镜检法   红细胞 <3/HPF（男 0~2、女 0~5）、白细胞 <5/HPF
--       仪器法   SYSMEX UF-1000i 红细胞/白细胞 <25/μL、管型 <1/μL
--       有形成分 上皮细胞"少量/偶见"、非透明管型正常不应出现、白细胞团阴性
--   · 有核红细胞：成人外周血 0（阴性），新生儿 1 周内可少量
--   · 异形红细胞率：无统一参考区间（<20% 属正常范围，>50% 提示肾小球源性），
--     故只写文字说明、不设硬性数值区间——避免把"混合型"误判成异常

-- ── 1. 新条目 ────────────────────────────────────────────────────────────────
INSERT INTO metric_definitions
  (id, name, category, unit, loinc_code, snomed_code, aliases,
   reference_range_low, reference_range_high, reference_range_text, description,
   display_precision, sort_order)
VALUES
  ('urine_rbc', '尿沉渣红细胞', 'urinalysis', '/HPF', NULL, NULL,
   '["尿红细胞","尿沉渣红细胞","尿液红细胞","红细胞(尿)","尿RBC","尿中红细胞"]'::jsonb,
   0, 3, '0~3/HPF（离心镜检）',
   '尿液红细胞。离心镜检 0~3/HPF（男 0~2、女 0~5）；流式仪器法上限更高（约 0~25/μL）。各实验室口径不一，以报告单区间为准。',
   1, 134),
  ('urine_wbc', '尿沉渣白细胞', 'urinalysis', '/HPF', NULL, NULL,
   '["尿白细胞","尿沉渣白细胞","尿液白细胞","白细胞(尿)","尿WBC","尿中白细胞"]'::jsonb,
   0, 5, '0~5/HPF（离心镜检）',
   '尿液白细胞。离心镜检 0~5/HPF；流式仪器法约 0~25/μL。以报告单区间为准。',
   1, 135),
  ('wbc_clumps', '白细胞团', 'urinalysis', '/μL', NULL, NULL,
   '["白细胞团","白细胞聚集团","白细胞团块"]'::jsonb,
   NULL, NULL, '阴性',
   '白细胞团为定性项目，正常应为阴性/0；无统一数值参考区间，以报告单为准。',
   0, 136),
  ('urine_cast', '尿沉渣管型', 'urinalysis', '/LPF', NULL, NULL,
   '["管型","尿管型","管型计数"]'::jsonb,
   0, 1, '0~1/LPF（偶见透明管型）',
   '尿沉渣管型。离心镜检偶见透明管型（0~1/LPF）；流式仪器法 <1/μL。',
   1, 137),
  ('hyaline_cast', '透明管型', 'urinalysis', '/LPF', NULL, NULL,
   '["透明管型"]'::jsonb,
   0, 1, '0~1/LPF',
   '透明管型。健康人离心尿中可偶见。',
   1, 138),
  ('nonhyaline_cast', '非透明管型', 'urinalysis', NULL, NULL, NULL,
   '["非透明管型"]'::jsonb,
   NULL, NULL, '阴性（正常不应出现）',
   '非透明管型（颗粒/细胞/蜡样管型等）正常不应出现；各实验室参考区间不统一，以报告单为准。',
   1, 139),
  ('epithelial_cells', '上皮细胞', 'urinalysis', '/HPF', NULL, NULL,
   '["上皮细胞","尿上皮细胞"]'::jsonb,
   NULL, NULL, '少量/偶见',
   '尿上皮细胞。少量属正常，女性可因分泌物污染增多；无统一数值区间。',
   1, 140),
  ('dysmorphic_rbc_pct', '异形红细胞率', 'urinalysis', '%', NULL, NULL,
   '["异形红细胞率","畸形红细胞率","异形红细胞百分比","尿红细胞形态"]'::jsonb,
   NULL, NULL, '参考：<20% 属正常范围；>50% 提示肾小球源性',
   '尿红细胞位相。正常以均一型为主，畸形红细胞 <20%；>50% 提示肾小球源性血尿（部分文献以 ≥75%~80% 为诊断阈值）。各实验室判读口径不一，故不设硬性数值区间。',
   1, 141),
  ('nrbc_pct', '有核红细胞比率', 'hematology', '%', NULL, NULL,
   '["有核红细胞比率","有核红细胞百分比","NRBC%"]'::jsonb,
   NULL, 0, '成人 0（阴性）',
   '成人外周血不应出现有核红细胞；新生儿出生 1 周内可见少量。',
   1, 142),
  ('nrbc_count', '有核红细胞计数', 'hematology', '10^6/L', NULL, NULL,
   '["有核红细胞计数","NRBC"]'::jsonb,
   NULL, 0, '成人 0',
   '成人外周血有核红细胞计数应为 0；新生儿可生理性出现少量。',
   1, 143)
ON CONFLICT (id) DO NOTHING;

-- ── 2. 别名补充（报告原文写法）─────────────────────────────────────────────
UPDATE metric_definitions
SET aliases = COALESCE(aliases, '[]'::jsonb) || '["平均红细胞蛋白量"]'::jsonb
WHERE id = 'mch' AND NOT COALESCE(aliases, '[]'::jsonb) @> '["平均红细胞蛋白量"]'::jsonb;

UPDATE metric_definitions
SET aliases = COALESCE(aliases, '[]'::jsonb) || '["尿白细胞脂酶","白细胞脂酶"]'::jsonb
WHERE id = 'urine_leukocyte_esterase'
  AND NOT COALESCE(aliases, '[]'::jsonb) @> '["尿白细胞脂酶"]'::jsonb;

UPDATE metric_definitions
SET aliases = COALESCE(aliases, '[]'::jsonb) || '["uALB_2/UCR"]'::jsonb
WHERE id = 'uacr' AND NOT COALESCE(aliases, '[]'::jsonb) @> '["uALB_2/UCR"]'::jsonb;

-- ── 3. 参考区间（unit NULL = 字典基准单位行；unit 非 NULL = 单位专属行）─────
INSERT INTO reference_ranges
  (metric_code, sex, age_min, age_max, range_low, range_high, range_text, source, unit)
VALUES
  ('urine_rbc', 'male',   18, NULL, 0, 2,  '0~2/HPF',  '镜检法通行（检验结果临床解读 第3版）', NULL),
  ('urine_rbc', 'female', 18, NULL, 0, 5,  '0~5/HPF',  '镜检法通行（检验结果临床解读 第3版）', NULL),
  ('urine_rbc', NULL,     18, NULL, 0, 25, '0~25/μL',  '流式仪器法通行（SYSMEX UF-1000i）',   '/μL'),
  ('urine_wbc', NULL,     18, NULL, 0, 5,  '0~5/HPF',  '镜检法通行（吴阶平泌尿外科学 表1-3-2）', NULL),
  ('urine_wbc', NULL,     18, NULL, 0, 25, '0~25/μL',  '流式仪器法通行（SYSMEX UF-1000i）',   '/μL'),
  ('urine_cast', NULL,    18, NULL, 0, 1,  '0~1/LPF',  '镜检法通行（吴阶平泌尿外科学 表1-3-2）', NULL)
ON CONFLICT DO NOTHING;

-- ── 4. 历史观测改挂到正确条目（18 条，逐条对齐 original_value_text + unit）──
UPDATE observations SET metric_code = 'urine_rbc'
WHERE metric_code = 'rbc' AND original_value_text = '红细胞'
  AND unit IN ('/HPF', '/μL', '/ul');

UPDATE observations SET metric_code = 'mch'
WHERE metric_code = 'rbc' AND original_value_text LIKE '%平均红细胞蛋白量%';

UPDATE observations SET metric_code = 'dysmorphic_rbc_pct'
WHERE metric_code = 'rbc' AND original_value_text = '异形红细胞率';

UPDATE observations SET metric_code = 'nrbc_pct'
WHERE metric_code = 'rbc' AND original_value_text = '有核红细胞比率';

UPDATE observations SET metric_code = 'nrbc_count'
WHERE metric_code = 'rbc' AND original_value_text = '有核红细胞计数';

UPDATE observations SET metric_code = 'urine_wbc'
WHERE metric_code = 'wbc' AND original_value_text IN ('白细胞', '尿白细胞');

UPDATE observations SET metric_code = 'wbc_clumps'
WHERE metric_code = 'wbc' AND original_value_text = '白细胞团';

UPDATE observations SET metric_code = 'urine_leukocyte_esterase'
WHERE metric_code = 'wbc' AND original_value_text IN ('尿白细胞脂酶', '尿白细胞酯酶');

UPDATE observations SET metric_code = 'epithelial_cells'
WHERE metric_code = 'auto_1d7oh1o' AND original_value_text = '上皮细胞';

UPDATE observations SET metric_code = 'nonhyaline_cast'
WHERE metric_code = 'auto_1w3ifg8' AND original_value_text = '非透明管型';

UPDATE observations SET metric_code = 'hyaline_cast'
WHERE metric_code = 'auto_1w3ifg8' AND original_value_text = '透明管型';

UPDATE observations SET metric_code = 'urine_cast'
WHERE metric_code = 'auto_1w3ifg8' AND original_value_text = '管型';

-- ── 5. 改挂后同步 category / 重算异常标记（按各自报告单区间，不用字典口径）──
UPDATE observations o
SET category = d.category
FROM metric_definitions d
WHERE o.metric_code = d.id
  AND o.metric_code IN (
    'urine_rbc','urine_wbc','wbc_clumps','urine_leukocyte_esterase','dysmorphic_rbc_pct',
    'nrbc_pct','nrbc_count','epithelial_cells','urine_cast','hyaline_cast','nonhyaline_cast','mch'
  );

UPDATE observations
SET is_abnormal = CASE
  WHEN value_numeric IS NULL THEN NULL
  WHEN reference_range_low IS NULL AND reference_range_high IS NULL THEN is_abnormal
  ELSE (
    (reference_range_high IS NOT NULL AND value_numeric > reference_range_high)
    OR (reference_range_low IS NOT NULL AND value_numeric < reference_range_low)
  )
END
WHERE metric_code IN (
  'urine_rbc','urine_wbc','wbc_clumps','urine_leukocyte_esterase','dysmorphic_rbc_pct',
  'nrbc_pct','nrbc_count','epithelial_cells','urine_cast','hyaline_cast','nonhyaline_cast'
);

-- ── 6. 清理被串项污染的学习行 ───────────────────────────────────────────────
-- rbc 名下被写进了 /HPF、/μL、/ul、pg、10^6/L、% 六种单位的"检验科区间"，
-- 这些行会让后续「红细胞 + /μL」继续判成血常规 RBC；只保留 10^12/L 那一行。
DELETE FROM reference_ranges
WHERE metric_code = 'rbc' AND unit IS NOT NULL AND unit NOT IN ('10^12/L');

DELETE FROM reference_ranges
WHERE metric_code = 'wbc' AND unit IS NOT NULL AND unit NOT IN ('10^9/L');

-- ── 7. 清掉被污染的自学习条目与别名 ─────────────────────────────────────────
DELETE FROM reference_ranges WHERE metric_code = 'auto_1w3ifg8';

DELETE FROM metric_definitions
WHERE id = 'auto_1w3ifg8'
  AND NOT EXISTS (SELECT 1 FROM observations WHERE metric_code = 'auto_1w3ifg8')
  AND NOT EXISTS (SELECT 1 FROM optimal_ranges WHERE metric_code = 'auto_1w3ifg8')
  AND NOT EXISTS (SELECT 1 FROM user_dashboard_metrics WHERE metric_code = 'auto_1w3ifg8');

-- 自学习把「非鳞状上皮细胞」当成了「鳞状上皮细胞」的异写，删掉这条错误别名
UPDATE metric_definitions
SET aliases = aliases - '非鳞状上皮细胞'
WHERE id = 'auto_ciubu1' AND aliases ? '非鳞状上皮细胞';

-- 滴虫是定性项目，0~0 的零宽区间会算出「永远正常」，改为不设数值区间
UPDATE metric_definitions
SET reference_range_low = NULL, reference_range_high = NULL, reference_range_text = '阴性'
WHERE id = 'auto_4t3mfs';

-- 自学习把尿液有形成分判成了 hematology/metabolic（旧 inferAutoCategory 顺序问题），
-- 这里按名称校正已有条目。
UPDATE metric_definitions
SET category = 'urinalysis'
WHERE category <> 'urinalysis'
  AND (name LIKE '%尿%' OR name IN (
    '细菌','酵母菌','酵母样菌','结晶','粘液丝','上皮细胞计数','小圆上皮细胞',
    '鳞状上皮细胞','大未染色细胞计数','大未染色细胞比率','有核细胞计数','病理管型'
  ));
