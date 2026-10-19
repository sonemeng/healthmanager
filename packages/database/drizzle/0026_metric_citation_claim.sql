SET client_encoding = 'UTF8';

-- 0026 · 词库 citation 认领与类型修正（S5.0 · 21 方案 §15.2 / §15.7）
--
-- 背景（生产库实测 2026-10-19 19:45）：
--   字典 unverified 45 条 + 区间 unverified 4 条，其中绝大多数不是「漏填」而是
--   「本来就没有通行参考区间」或「来源是商业网站」。上轮只写了机制没有工单，
--   47/2 这两个数字无法回溯（§15.6 N4）。本迁移把工单落成数据。
--
-- 三类动作（判据机器可判，§15.2.2）：
--   X · 归位 30 条：无通行参考区间（方法依赖/自测/定性/无量纲/阈不一）
--       → citation_kind='exempt' + 一句可复核的豁免依据；source_tier 保持 unverified
--         （rank 9 是最低语义，动它等于动判读优先级）
--   Y · 调研 15 条：有基准区间且属常规检验项，报告没印区间时真的会参与判读
--       → citation_kind='cited' + 结构化 citation；按实际等级调 source_tier
--   Z · 修数据 6 条：tier/kind/category 标错或来源是网站 → 改值，补 citation 治不了
--
-- 新增列 citation_kind：cited（有文献引证）/ exempt（经人判定无通行参考区间）/ NULL（待补）。
--   「来源待补」的判据是 **source_tier='unverified' AND citation IS NULL AND citation_kind IS NULL**
--   三条件联合 —— 只看 citation 会把 47 条 auto_* 字典条目 + 92 条学习行一起报出来，
--   它们的可追溯性靠 observation_id 指向原报告，压根不需要 citation（§15.6 N7）。
--
-- 幂等：全部 UPDATE 带 `AND citation_kind IS NULL`（或等价的条件），连跑第二次 0 行。
-- 迁移内不写「45 条」这类总数断言 —— 数字随数据变，断言只针对「空值必须为 0」这类不变式。

-- ── 1. 加列 ──────────────────────────────────────────────────────────────────
ALTER TABLE metric_definitions ADD COLUMN IF NOT EXISTS citation_kind varchar(12);
ALTER TABLE reference_ranges  ADD COLUMN IF NOT EXISTS citation_kind varchar(12);

-- ── 2. X 类 · 归位 30 条（citation_kind='exempt'）─────────────────────────────
-- 为什么不硬补一个来源：这 30 条硬补只能补到百度百科/商业网站，
-- 那是把「不可追溯」伪装成「可追溯」，比留空更坏（§15.2.2）。
-- 把「为什么没有出处」写成一条可读、可统计的数据，换个人也看得懂。
UPDATE metric_definitions
SET citation_kind = 'exempt',
    citation = CASE id
      WHEN 'ck_mb'                 THEN '方法依赖：各厂商抗体/底物不同，cutoff 以报告单为准'
      WHEN 'troponin_i'            THEN '方法依赖：超敏法各厂商 99th 百分位不同，以报告单为准'
      WHEN 'amh'                   THEN '随年龄与检测平台变化极大，无单一年龄通区间，以报告单为准'
      WHEN 'igf_1'                 THEN '年龄/性别分层且平台差异大，以报告单为准'
      WHEN 'ldl_particle_number'   THEN '仅 NMR 法可测，无中国通行区间，以报告单为准'
      WHEN 'oxidized_ldl'          THEN '小众项目，方法未标准化，以报告单为准'
      WHEN 'reverse_t3'            THEN '方法依赖，以报告单为准'
      WHEN 'shbg'                  THEN '平台/性别差异大，以报告单为准（分性别区间见 reference_ranges）'
      WHEN 'tpo_antibodies'        THEN '化学发光法各厂商 cutoff 不同，以报告单为准'
      WHEN 'bnp'                   THEN '年龄分层且方法依赖，以报告单为准'
      WHEN 'dhea_s'                THEN '性别年龄分层，无单一区间，以报告单为准'
      WHEN 'free_testosterone'     THEN '方法依赖（LC-MS/MS vs 免疫法），以报告单为准'
      WHEN 'leptin'                THEN '小众项目，无通行国标，以报告单为准'
      WHEN 'lipase'                THEN '仪器依赖大，以报告单为准'
      WHEN 'vldl_cholesterol'      THEN '中国极少单列，可由 TG/2.2 推算，不设区间'
      WHEN 'bun_creatinine_ratio'  THEN '依赖两端单位口径，换算后无意义，以报告单为准'
      WHEN 'height'                THEN '自测项，无参考区间'
      WHEN 'weight'                THEN '自测项，无参考区间（判读看 BMI）'
      WHEN 'resting_heart_rate'    THEN '设备自测，60~100 为教材通行值，非诊断区间'
      WHEN 'sleep_duration'        THEN '设备自测，7~9h 为睡眠卫生建议，非参考区间'
      WHEN 'hrv_rmssd'             THEN '厂商算法私有，无通行区间'
      WHEN 'recovery_score'        THEN '厂商私有算法（0~33 红/34~66 黄/67~100 绿），非临床区间'
      WHEN 'strain_score'          THEN '厂商私有量表，非临床区间'
      WHEN 'hp_antibody'           THEN '定性项目，阴性/阳性为判读结论，无数值区间'
      WHEN 'nonhyaline_cast'       THEN '定性项目，各实验室报告口径不一'
      WHEN 'urine_leukocyte_esterase' THEN '定性/半定量（-、±、1+…），无数值区间'
      WHEN 'ast_alt_ratio'         THEN '比值随两酶各自方法变化，无通行区间'
      WHEN 'dysmorphic_rbc_pct'    THEN '判读阈值文献不一（<20% 正常 / >50% 肾小球源性），不设硬区间'
      WHEN 'wbc_clumps'            THEN '定性项目（正常为阴性），无数值参考区间'
      WHEN 'epithelial_cells'      THEN '半定量项目（少量/偶见/+），无数值参考区间'
      ELSE citation
    END,
    verified_at = now(),
    verified_by = 'rule:no-reference-standard'
WHERE id IN (
  'ck_mb', 'troponin_i', 'amh', 'igf_1', 'ldl_particle_number', 'oxidized_ldl',
  'reverse_t3', 'shbg', 'tpo_antibodies', 'bnp', 'dhea_s', 'free_testosterone',
  'leptin', 'lipase', 'vldl_cholesterol', 'bun_creatinine_ratio', 'height',
  'weight', 'resting_heart_rate', 'sleep_duration', 'hrv_rmssd', 'recovery_score',
  'strain_score', 'hp_antibody', 'nonhyaline_cast', 'urine_leukocyte_esterase',
  'ast_alt_ratio', 'dysmorphic_rbc_pct', 'wbc_clumps', 'epithelial_cells'
)
  AND citation_kind IS NULL;

-- ── 3. Z 类 · 修数据 6 条（bnp/wbc_clumps/epithelial_cells/ule/shbg）────────────
-- #1 bnp 分类错（B 型钠尿肽是心脏标志物，误标 urinalysis → 检验页分组错、AI 上下文也可能错）。
--    实测 bnp 无任何观测，改分类零判读风险。
UPDATE metric_definitions SET category = 'cardiac'
WHERE id = 'bnp' AND category = 'urinalysis';

-- #3/#4 unit_kind 误标（定性/半定量被标成 quantitative）。
--    这不只是洁癖：S1 的豁免判据是 qualitative，标错就会让定性项走门禁 → 假待办。
--    semi_quantitative 原先不被豁免判据识别，本轮同步把它补进 normalizer 的豁免集，
--    否则 epithelial_cells 改完 kind 反而会被 unit_missing 拦（半定量项常无单位）。
UPDATE metric_definitions SET unit_kind = 'qualitative'
WHERE id = 'wbc_clumps' AND unit_kind = 'quantitative';

UPDATE metric_definitions SET unit_kind = 'semi_quantitative'
WHERE id = 'epithelial_cells' AND unit_kind = 'quantitative';

-- #6 尿白细胞酯酶是定性项（实测值 '-'），却在 0021 拆项时挂上了血白细胞的单位 10^9/L。
--    留着会让界面给「阴性」配一个 /µL 量级的单位。观测与字典两处都清。
UPDATE observations SET unit = NULL
WHERE metric_code = 'urine_leukocyte_esterase' AND unit IS NOT NULL;

UPDATE metric_definitions SET unit = NULL
WHERE id = 'urine_leukocyte_esterase'
  AND unit IS NOT NULL
  AND unit_kind = 'qualitative';

-- #2 shbg：基准列 10~80 是折中值，reference_range_text 写「男 10-57 / 女 18-144」，
--    与 RBC 同属「基准列装不下性别」。补 2 条分性别行，基准列保持不动（§1.3.1 原则）。
--    这两行本身没有权威文献（SHBG 平台/性别差异大，字典条目本身即 X 类 exempt），
--    因此 citation_kind='exempt' 与字典条目一致 —— 不假装它们有出处。
--    实测 shbg 无观测 → 分支改动零判读风险（差分探针仍会跑一遍确认）。
INSERT INTO reference_ranges
  (metric_code, sex, range_low, range_high, source, source_tier, citation, citation_kind, verified_at, verified_by)
SELECT 'shbg', 'male', 10, 57, '公开医学知识库', 'unverified',
       '平台/性别差异大，无权威通行区间，以报告单为准（源自原 reference_range_text：男 10-57 nmol/L）',
       'exempt', now(), 'rule:no-reference-standard'
WHERE NOT EXISTS (
  SELECT 1 FROM reference_ranges WHERE metric_code = 'shbg' AND sex = 'male'
);

INSERT INTO reference_ranges
  (metric_code, sex, range_low, range_high, source, source_tier, citation, citation_kind, verified_at, verified_by)
SELECT 'shbg', 'female', 18, 144, '公开医学知识库', 'unverified',
       '平台/性别差异大，无权威通行区间，以报告单为准（源自原 reference_range_text：女 18-144 nmol/L）',
       'exempt', now(), 'rule:no-reference-standard'
WHERE NOT EXISTS (
  SELECT 1 FROM reference_ranges WHERE metric_code = 'shbg' AND sex = 'female'
);

-- ── 3b. Z#5 · ca724 / fpsa 的网站来源（字典 + 区间行同批）─────────────────────
-- 现实检验（2026-10-19 联网取证，见 §15.8 P3）：
--   · ca724：罗氏 Elecsys CA 72-4 试剂说明书（多中心研究 B99P026，n=635）参考上限 **6.9 U/mL**，
--            与现行字典值 6.7 U/mL **不符** → 找不到能为 6.7 背书的权威出处。
--   · fpsa ：WS/T 460-2015 只规定总 PSA <4.0 μg/L 与 %fPSA 判读，
--            **未给出游离 PSA 绝对值参考上限** → 无法为 0.8 提供标准出处。
-- 因此处置为 P3 的退路（B）：**不换源、不删区间、不改数值、不升 tier** ——
-- 升 tier 等于给一个与权威口径不符的值发「已核验」通行证（违反铁律 1）。
-- 只把「已查、查到什么、差异在哪、待人工裁决」写成 citation（citation_kind='cited'），
-- 使其从「来源待补」变成「来源已查、有分歧待裁决」——这正是认领机制要表达的语义。
-- 两条指标均**无任何观测**，现有判读不受影响。
UPDATE metric_definitions
SET citation_kind = 'cited',
    citation = CASE id
      WHEN 'ca724' THEN '罗氏 Elecsys CA 72-4 试剂说明书（多中心研究 B99P026，n=635 健康人）参考上限 6.9 U/mL（95th 百分位）；现行字典值 6.7 U/mL 源自商业网站（中国医药信息查询平台），与该权威口径不符，待人工裁决'
      WHEN 'fpsa'  THEN 'WS/T 460-2015《前列腺特异性抗原检测前列腺癌临床应用》仅规定总 PSA <4.0 μg/L 与 %fPSA 判读，未给游离 PSA 绝对值参考上限；现行字典值 0.8 ng/mL 源自商业网站（中国医药信息查询平台），待人工裁决'
    END,
    verified_at = now(),
    verified_by = 'ai:research'
WHERE id IN ('ca724', 'fpsa')
  -- source_tier 有意保持 'unverified'（值未获权威口径支持）
  AND citation_kind IS NULL;

UPDATE reference_ranges
SET citation_kind = 'cited',
    citation = CASE metric_code
      WHEN 'ca724' THEN '罗氏 Elecsys CA 72-4 试剂说明书（多中心研究 B99P026，n=635 健康人）参考上限 6.9 U/mL（95th 百分位）；本行值 6.7 U/mL 源自商业网站（中国医药信息查询平台），与权威口径不符，待人工裁决'
      WHEN 'fpsa'  THEN 'WS/T 460-2015《前列腺特异性抗原检测前列腺癌临床应用》仅规定总 PSA <4.0 μg/L 与 %fPSA 判读，未给游离 PSA 绝对值参考上限；本行值 0.8 ng/mL 源自商业网站（中国医药信息查询平台），待人工裁决'
    END,
    verified_at = now(),
    verified_by = 'ai:research'
WHERE metric_code IN ('ca724', 'fpsa')
  AND source_tier = 'unverified'
  AND citation_kind IS NULL;

-- ── 4. Y 类 · 调研 13 条（citation_kind='cited' + 按实际等级调 tier）───────────
-- 硬校验的精神（§4.12.4 第 2 步）：cite 必须能落到具体文献，不接受「通行口径」四个字。
-- ca724 / fpsa 不在本段（已在 3b 单独处理，因值不符不升 tier）。
-- 其中 alb/glb 比值与 PSA 在取证中直接命中了行业标准原文，因此 tier 升到 national_standard，
-- 比原方案预期的「查书」更强；4 条有观测的指标（含观测最可能触发判读）引用写得最细。
UPDATE metric_definitions
SET citation_kind = 'cited',
    source_tier = CASE id
      WHEN 'albumin_globulin_ratio' THEN 'national_standard'
      WHEN 'psa_total'              THEN 'national_standard'
      WHEN 'non_hdl_cholesterol'    THEN 'guideline'
      WHEN 'omega_3_index'          THEN 'guideline'
      WHEN 'aso'                    THEN 'instrument'
      WHEN 'rheumatoid_factor'      THEN 'instrument'
      WHEN 'methylmalonic_acid'     THEN 'instrument'
      ELSE 'textbook'
    END,
    citation = CASE id
      WHEN 'non_hdl_cholesterol'    THEN '中国血脂管理指南（2023）：非 HDL-C 合适水平 <4.1 mmol/L'
      WHEN 'copper'                 THEN '《哈里森内科学》血清铜参考值 11.0~22.0 µmol/L（等值 70~140 µg/dL）'
      WHEN 'selenium'               THEN '《哈里森内科学》血清硒参考值 63~160 µg/L（等值 0.8~2.0 µmol/L）'
      WHEN 'zinc'                   THEN '《哈里森内科学》血清锌参考值 11.5~18.4 µmol/L（等值 75~120 µg/dL）'
      WHEN 'hyaline_cast'           THEN '《全国临床检验操作规程》第4版 尿沉渣镜检：透明管型 0~1/LPF'
      WHEN 'nrbc_count'             THEN '《诊断学》（人民卫生出版社）第9版：成人外周血不应出现有核红细胞'
      WHEN 'nrbc_pct'               THEN '《诊断学》（人民卫生出版社）第9版：成人外周血有核红细胞比率为 0'
      WHEN 'albumin_globulin_ratio' THEN 'WS/T 404.2-2012 表1：白蛋白/球蛋白比值 男/女 1.2~2.4'
      WHEN 'aso'                    THEN '试剂说明书（胶乳凝集法）：ASO <200 IU/mL；速率散射比浊法参考上限 116 IU/mL'
      WHEN 'rheumatoid_factor'      THEN '试剂说明书（乳胶凝集法）：RF <20 IU/mL（各法 cutoff 不同）'
      WHEN 'psa_total'              THEN 'WS/T 460-2015：血清总 PSA <4.0 ng/mL'
      WHEN 'methylmalonic_acid'     THEN 'LC-MS/MS 试剂说明书：血清 MMA 87~318 nmol/L'
      WHEN 'omega_3_index'          THEN 'Omega-3 指数共识：≥8% 为理想'
      ELSE citation
    END,
    verified_at = now(),
    verified_by = 'ai:research'
WHERE id IN (
  'non_hdl_cholesterol', 'copper', 'selenium', 'zinc', 'hyaline_cast',
  'nrbc_count', 'nrbc_pct', 'albumin_globulin_ratio', 'aso', 'rheumatoid_factor',
  'psa_total', 'methylmalonic_acid', 'omega_3_index'
)
  AND citation_kind IS NULL;

-- ── 5. 区间 4 条的处置（191/192 已在 3b 处理）────────────────────────────────
-- range 262（auto_5nvlzq /µL 0~29）：先查同 metric 同单位同区间的观测补 observation_id；
--   实测该指标 2 条观测的区间都是 0~137（对应 range 201），查不到 0~29 的来源 → 删。
UPDATE reference_ranges r
SET observation_id = o.id
FROM observations o
WHERE r.id = 262
  AND r.observation_id IS NULL
  AND o.metric_code = r.metric_code
  AND o.unit = r.unit
  AND o.reference_range_low IS NOT DISTINCT FROM r.range_low
  AND o.reference_range_high IS NOT DISTINCT FROM r.range_high;

DELETE FROM reference_ranges WHERE id = 262 AND observation_id IS NULL;

-- range 293（auto_1d7oh1o /HPF 0~1）：字典单位是 /µL，2a 按 canonicalUnit 匹配永不命中，
--   是一条死行；且无 observation_id 溯源。同指标另有 292（/µL 0~1.86，有观测）→ 直接删。
DELETE FROM reference_ranges WHERE id = 293;

-- 兜底：若有仍未认领的 unverified 区间行（本轮实测 0 行），统一标 exempt 而非留空
-- （保证不变式成立，且不会伪造来源）。此段与 3b 的顺序无关，因 3b 已把 191/192 认领。
UPDATE reference_ranges
SET citation_kind = 'exempt',
    citation = coalesce(citation, '无通行参考区间的学习行，以报告单为准'),
    verified_at = now(),
    verified_by = 'rule:no-reference-standard'
WHERE source_tier = 'unverified'
  AND citation IS NULL
  AND citation_kind IS NULL;

-- ── 6. 迁移内硬断言 ──────────────────────────────────────────────────────────
-- 断言只写不变式，不写「45」这类会腐烂的总数（§15.7 S5.0 第 7 步）。
-- 特别地：**不要**写成全局 `citation IS NULL` —— 实测字典 47 条 lab_learned（auto_*）
-- 与区间 92 条学习行的 citation 本来就是空的，它们的可追溯性靠 observation_id。
DO $$
DECLARE
  n integer;
BEGIN
  -- 断言口径（v0.1.27 修正）：只要求「名下至少有一条区间行」的字典条目被认领。
  -- 理由（实测 2026-10-20，空库→全量迁移→字典播种）：新装库里有 24 条字典条目
  -- **没有任何 reference_ranges 行**（如 magnesium / phosphate / indirect_bilirubin /
  -- neutrophils_pct …）。它们的 tier 在开发机真实库上来自用户报告学成的行（lab_learned），
  -- 空库里不存在这种行，0024 只能如实标成 unverified —— 此时没有「出处」可认领，
  -- 强行写 exempt 等于把「其实有国标、只是新装还没有区间行」说成「本来就没有通行区间」，
  -- 属于伪造来源。这类条目由校验器 R8（WARN，来源待补）呈现，不阻断打包。
  -- 有区间行的条目仍然硬断言：一条 unverified 区间说不出出处就是缺陷。
  SELECT count(*) INTO n
  FROM metric_definitions m
  WHERE m.source_tier = 'unverified' AND m.citation IS NULL AND m.citation_kind IS NULL
    AND EXISTS (SELECT 1 FROM reference_ranges r WHERE r.metric_code = m.id);
  IF n > 0 THEN
    RAISE EXCEPTION '0026: % metric_definitions unverified rows lack citation/citation_kind', n;
  END IF;

  SELECT count(*) INTO n
  FROM reference_ranges
  WHERE source_tier = 'unverified' AND citation IS NULL AND citation_kind IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION '0026: % reference_ranges unverified rows lack citation/citation_kind', n;
  END IF;

  SELECT count(*) INTO n
  FROM metric_definitions
  WHERE unit_kind = 'quantitative' AND (unit IS NULL OR unit = '');
  IF n > 0 THEN
    RAISE EXCEPTION '0026: % quantitative metrics have no unit', n;
  END IF;
END $$;
