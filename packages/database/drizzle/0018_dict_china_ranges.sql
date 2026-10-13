-- 0018 · 字典全量中国化 + 化验单区间学习回填（spec 19 v3，2026-10-12）
-- 数值底册：19-附录-字典中国化全量对照表-20261012.md（159 条，✅111 换值/➖48 维持置空）
-- 拍板记录：spec 19 §9（胆红素/血脂单侧、ARUP 全删替换、门禁保留、分期激素不进判定列）
-- 存量库靠本迁移；新装机靠 seed 同口径（07 号坑 10：seed 是 onConflictDoNothing，不影响存量库）。

SET client_encoding = 'UTF8';

-- 1) reference_ranges 增加 unit 列：NULL=字典基准单位；非 NULL=化验单学习行（spec 19 §3.2）
ALTER TABLE "reference_ranges" ADD COLUMN "unit" varchar(50);--> statement-breakpoint

-- 2) 唯一约束扩列：学习行（带单位）与国标行、不同检验科的学习行可并存；
--    旧四列约束下「国标 any/any 行 + 学习行」必然撞车 → 迁移崩溃（0.1.4 级风险），故必须替换。
--    NULLS NOT DISTINCT：新装机「迁移已插国标行 + seed 再插同值行」时 onConflictDoNothing 才能真正去重
--    （PG 默认 NULLS DISTINCT 对含 NULL 的行不判重，会导致国标行 ×2）。
ALTER TABLE "reference_ranges" DROP CONSTRAINT "reference_ranges_metric_sex_age_uniq";--> statement-breakpoint
ALTER TABLE "reference_ranges" ADD CONSTRAINT "reference_ranges_metric_sex_age_unit_uniq" UNIQUE NULLS NOT DISTINCT ("metric_code","sex","age_min","age_max","unit","range_low","range_high");--> statement-breakpoint

-- 3) metric_definitions 全量中国化（默认区间取男性行兜底；真正判定走 Priority-2 分性别人口学行）
UPDATE metric_definitions AS m
SET unit = v.unit,
    reference_range_low = v.low,
    reference_range_high = v.high,
    reference_range_text = v.text
FROM (VALUES
  -- 血常规（WS/T 405-2012；单位按报告实际写法 10^9/L / 10^12/L 落库，探针实证 2026-10-12）
  ('wbc','10^9/L',3.5,9.5,'3.5~9.5 ×10⁹/L（WS/T 405-2012）'),
  ('neutrophils_abs','10^9/L',1.8,6.3,'1.8~6.3 ×10⁹/L（WS/T 405-2012）'),
  ('lymphocytes_abs','10^9/L',1.1,3.2,'1.1~3.2 ×10⁹/L（WS/T 405-2012）'),
  ('monocytes_abs','10^9/L',0.1,0.6,'0.1~0.6 ×10⁹/L（WS/T 405-2012）'),
  ('eosinophils_abs','10^9/L',0.02,0.52,'0.02~0.52 ×10⁹/L（WS/T 405-2012）'),
  ('basophils_abs','10^9/L',0,0.06,'0~0.06 ×10⁹/L（WS/T 405-2012）'),
  ('neutrophils_pct','%',40,75,'40~75%（WS/T 405-2012）'),
  ('lymphocytes_pct','%',20,50,'20~50%（WS/T 405-2012）'),
  ('monocytes_pct','%',3,10,'3~10%（WS/T 405-2012）'),
  ('eosinophils_pct','%',0.4,8.0,'0.4~8.0%（WS/T 405-2012）'),
  ('basophils_pct','%',0,1,'0~1%（WS/T 405-2012）'),
  ('rbc','10^12/L',4.3,5.8,'男 4.3~5.8 / 女 3.8~5.1 ×10¹²/L（WS/T 405-2012）'),
  ('hemoglobin','g/L',130,175,'男 130~175 / 女 115~150 g/L（WS/T 405-2012）'),
  ('hematocrit','%',40.0,50.0,'男 40~50 / 女 35~45 %（WS/T 405-2012）'),
  ('mcv','fL',82,100,'82~100 fL（WS/T 405-2012）'),
  ('mch','pg',27,34,'27~34 pg（WS/T 405-2012）'),
  ('mchc','g/L',316,354,'316~354 g/L（WS/T 405-2012）'),
  ('platelets','10^9/L',125,350,'125~350 ×10⁹/L（WS/T 405-2012）'),
  ('mpv','fL',6.5,12,'6.5~12 fL（通行口径）'),
  -- 代谢
  ('alt','U/L',9,50,'男 9~50 / 女 7~40 U/L（WS/T 404.1-2012）'),
  ('ast','U/L',15,40,'男 15~40 / 女 13~35 U/L（WS/T 404.1-2012）'),
  ('alp','U/L',45,125,'男 45~125；女 20-49 岁 35~100、50-79 岁 50~135 U/L（WS/T 404.1-2012）'),
  ('bilirubin_total','μmol/L',NULL,26.0,'男 ≤26.0 / 女 ≤21.0 μmol/L（WS/T 404.4-2018，单侧）'),
  ('direct_bilirubin','μmol/L',NULL,8.0,'≤8.0 μmol/L（罗氏/系统a；贝克曼 ≤4.0，以报告单为准。WS/T 404.4-2018）'),
  ('bun','mmol/L',3.1,8.0,'男 20-59 岁 3.1~8.0、60-79 岁 3.6~9.5；女 20-59 岁 2.6~7.5、60-79 岁 3.1~8.8 mmol/L（WS/T 404.5-2015）'),
  ('creatinine','μmol/L',57,97,'男 57~97（60-79 岁 57~111）/ 女 41~73（60-79 岁 41~81）μmol/L（WS/T 404.5-2015）'),
  ('uric_acid','μmol/L',208,428,'男 208~428 / 女 155~357 μmol/L（通行口径）'),
  ('glucose','mmol/L',3.9,6.1,'3.9~6.1 mmol/L（空腹，通行口径）'),
  ('calcium','mmol/L',2.11,2.52,'2.11~2.52 mmol/L（WS/T 404.6-2015）'),
  ('magnesium','mmol/L',0.75,1.02,'0.75~1.02 mmol/L（WS/T 404.6-2015）'),
  ('phosphate','mmol/L',0.85,1.51,'0.85~1.51 mmol/L（WS/T 404.6-2015）'),
  ('potassium','mmol/L',3.5,5.3,'3.5~5.3 mmol/L（WS/T 404.3-2012）'),
  ('sodium','mmol/L',137,147,'137~147 mmol/L（WS/T 404.3-2012）'),
  ('chloride','mmol/L',99,110,'99~110 mmol/L（WS/T 404.3-2012）'),
  ('co2','mmol/L',22,29,'22~29 mmol/L（通行口径）'),
  ('total_protein','g/L',65,85,'65~85 g/L（WS/T 404.2-2012）'),
  ('albumin','g/L',40,55,'40~55 g/L（WS/T 404.2-2012）'),
  ('globulin','g/L',20,40,'20~40 g/L（通行口径）'),
  ('albumin_globulin_ratio',NULL,1.2,2.4,'1.2~2.4（通行口径）'),
  ('hemoglobin_a1c','%',4.0,6.0,'4.0~6.0%（正常 <6.0，通行口径）'),
  ('ldh','U/L',120,250,'120~250 U/L（WS/T 404.7-2015）'),
  ('c_peptide','nmol/L',0.3,1.3,'0.3~1.3 nmol/L（空腹，通行口径）'),
  ('lipase','U/L',NULL,NULL,'以报告单为准（仪器依赖大）'),
  -- 肾
  ('bun_creatinine_ratio',NULL,NULL,NULL,'以报告单为准（单位换算后 mg/dL 比值无意义）'),
  ('uacr','mg/g',NULL,30,'<30 mg/g（通行口径）'),
  -- 血脂（§9-② 指南单侧）
  ('cholesterol_total','mmol/L',NULL,5.2,'合适水平 ≤5.2 mmol/L（中国血脂管理指南 2023）'),
  ('triglycerides','mmol/L',NULL,1.7,'合适水平 ≤1.7 mmol/L（中国血脂管理指南 2023）'),
  ('ldl_cholesterol','mmol/L',NULL,3.4,'合适水平 ≤3.4 mmol/L（中国血脂管理指南 2023）'),
  ('hdl_cholesterol','mmol/L',1.0,NULL,'合适水平 ≥1.0 mmol/L（中国血脂管理指南 2023）'),
  ('non_hdl_cholesterol','mmol/L',NULL,4.1,'合适水平 ≤4.1 mmol/L（中国血脂管理指南 2023）'),
  ('apoa1','g/L',1.00,1.60,'1.00~1.60 g/L（通行口径）'),
  ('apob','g/L',0.60,1.10,'0.60~1.10 g/L（通行口径）'),
  ('vldl_cholesterol',NULL,NULL,NULL,'以报告单为准（中国极少单列，可由 TG/2.2 推算）'),
  ('lp_a','mg/L',NULL,300,'<300 mg/L（通行口径）'),
  ('oxidized_ldl','U/L',0,60,'以报告单为准（小众项目，无通行国标）'),
  -- 炎症
  ('crp','mg/L',NULL,6.0,'≤6.0 mg/L（非超敏试剂，WS/T 404.9-2018）'),
  ('hs_crp','mg/L',NULL,3.0,'<3.0 mg/L（通行口径）'),
  ('esr','mm/hr',0,15,'男 0~15 / 女 0~20 mm/hr（通行口径）'),
  ('fibrinogen','g/L',2,4,'2~4 g/L（通行口径）'),
  ('homocysteine','μmol/L',5,15,'5~15 μmol/L（通行口径）'),
  -- 铁代谢
  ('iron','μmol/L',10.6,36.7,'男 10.6~36.7 / 女 7.8~32.2 μmol/L（WS/T 404.6-2015）'),
  ('tibc','μmol/L',50,77,'男 50~77 / 女 54~77 μmol/L（通行口径）'),
  ('ferritin','ng/mL',18,270,'男 18~270 / 女 18~160 ng/mL（通行口径）'),
  ('transferrin_saturation','%',20,55,'20~55%（通行口径）'),
  -- 甲状腺（化学发光法通行口径，方法依赖）
  ('tsh','mIU/L',0.27,4.2,'0.27~4.2 mIU/L（化学发光法通行口径，以报告单为准）'),
  ('free_t3','pmol/L',3.1,6.8,'3.1~6.8 pmol/L（化学发光法通行口径，以报告单为准）'),
  ('free_t4','pmol/L',12,22,'12~22 pmol/L（化学发光法通行口径，以报告单为准）'),
  ('total_t3','nmol/L',1.3,3.1,'1.3~3.1 nmol/L（化学发光法通行口径，以报告单为准）'),
  ('total_t4','nmol/L',66,181,'66~181 nmol/L（化学发光法通行口径，以报告单为准）'),
  ('tpo_antibodies','IU/mL',NULL,60,'≤60 IU/mL（化学发光法通行口径）'),
  ('reverse_t3','ng/dL',9.2,24.1,'方法依赖，以报告单为准'),
  -- 肝
  ('ggt','U/L',10,60,'男 10~60 / 女 7~45 U/L（WS/T 404.1-2012）'),
  ('indirect_bilirubin','μmol/L',1.7,10.2,'1.7~10.2 μmol/L（通行口径）'),
  -- 心脏
  ('creatine_kinase','U/L',50,310,'男 50~310 / 女 40~200 U/L（WS/T 404.7-2015）'),
  ('ck_mb','ng/mL',0,5,'方法依赖，以报告单为准'),
  ('troponin_i','ng/mL',0,0.04,'方法依赖（超敏法各厂商 cutoff 不同），以报告单为准'),
  ('bnp','pg/mL',0,100,'年龄分层，以报告单为准'),
  -- 激素（分期激素区间不进判定列：low/high 置空，分期表进 text；报告原文区间优先级 1 不受影响）
  ('fsh','mIU/mL',NULL,NULL,'男 1.5~12.4；女卵泡期 3.5~12.5 / 排卵期 4.7~21.5 / 黄体期 1.7~7.7 / 绝经后 25.8~134.8 mIU/mL（月经第2-4天采血口径，其他阶段以报告单为准）'),
  ('lh','mIU/mL',NULL,NULL,'男 1.7~8.6；女卵泡期 2.4~12.6 / 排卵期 14~95.6 / 黄体期 1.0~11.4 / 绝经后 7.7~58.5 mIU/mL（月经第2-4天采血口径，其他阶段以报告单为准）'),
  ('estradiol','pg/mL',NULL,NULL,'男 8~36；女卵泡期 24~114 / 排卵期 62~534 / 黄体期 80~273 / 绝经后 20~88 pg/mL（月经第2-4天采血口径，其他阶段以报告单为准）'),
  ('progesterone','ng/mL',NULL,NULL,'男 0.4~0.84；女卵泡期 0.31~1.52 / 黄体期 5.16~18.56 / 绝经后 <0.78 ng/mL（分期口径，以报告单为准）'),
  ('prolactin','ng/mL',4,15.2,'男 4~15.2 / 女 3.34~25 ng/mL（非孕期，通行口径）'),
  ('testosterone_total','nmol/L',8.64,29.0,'男 8.64~29.0 / 女 1.3~2.8 nmol/L（通行口径）'),
  ('free_testosterone','pg/mL',NULL,NULL,'方法依赖，以报告单为准'),
  ('cortisol','nmol/L',171,536,'171~536 nmol/L（上午 8 时采血；昼夜节律强，其他时段以报告单为准）'),
  ('dhea_s','mcg/dL',NULL,NULL,'性别年龄分层，以报告单为准'),
  ('leptin','ng/mL',NULL,NULL,'以报告单为准（小众项目，无通行国标）'),
  ('pth','pg/mL',15,65,'15~65 pg/mL（化学发光，通行口径）'),
  -- 维生素
  ('vitamin_d','ng/mL',20,100,'20~100 ng/mL；<20 缺乏 / 20~30 不足 / ≥30 充足（WS/T 677-2020）'),
  ('folate','ng/mL',5.4,18.0,'5.4~18.0 ng/mL（血清叶酸，通行口径）'),
  ('copper','μmol/L',11.0,22.0,'11.0~22.0 μmol/L（通行口径）'),
  ('zinc','μmol/L',11.5,18.4,'11.5~18.4 μmol/L（通行口径）'),
  ('selenium','μg/L',63,160,'63~160 μg/L（通行口径）'),
  -- 生命体征
  ('bmi','kg/m2',18.5,23.9,'18.5~23.9（WS/T 428-2013；24~27.9 超重、≥28 肥胖）'),
  ('temperature','℃',36,37,'36~37 ℃（通行口径）'),
  ('height','cm',NULL,NULL,NULL),
  ('weight','kg',NULL,NULL,NULL),
  -- 肿瘤标志物（WS/T 645.2，单侧 ≤ 口径；系统特异取罗氏为默认）
  ('afp','ng/mL',NULL,7,'≤7 ng/mL（WS/T 645.2）'),
  ('cea','ng/mL',NULL,5,'≤5 ng/mL（WS/T 645.2）'),
  ('ca199','U/mL',NULL,30,'≤30 U/mL（罗氏/系统a；贝克曼 ≤25、西门子 ≤34、雅培 ≤43，以报告单为准）'),
  ('ca153','U/mL',NULL,24,'≤24 U/mL（罗氏/系统a；其他系统 ≤15~20，以报告单为准）'),
  ('ca125','U/mL',NULL,24,'男 ≤24；女 18-49 岁 ≤47、≥50 岁 ≤25 U/mL（WS/T 645.2，罗氏/系统a）'),
  ('ca724','U/mL',NULL,6.7,'≤6.7 U/mL（中国医药信息查询平台）'),
  ('fpsa','ng/mL',NULL,0.8,'≤0.8 ng/mL（f-PSA）'),
  -- 尿液（尿糖/尿蛋白改定性口径：§9 拍板）
  ('specific_gravity',NULL,1.003,1.035,'1.003~1.035（通行口径）'),
  ('urine_ph',NULL,4.6,8.0,'4.6~8.0（通行口径）'),
  ('urine_glucose',NULL,NULL,NULL,'阴性（干化学定性）'),
  ('urine_protein',NULL,NULL,NULL,'阴性（干化学定性）')
) AS v(id, unit, low, high, text)
WHERE m.id = v.id;--> statement-breakpoint

-- 4) bun 名称改为「尿素（BUN）」（附录代谢节）
UPDATE metric_definitions SET name = '尿素（BUN）' WHERE id = 'bun';--> statement-breakpoint

-- 5) ARUP 87 行整体删除（§9-④ 全删替换；库证 2026-10-12：source 全部='ARUP'）
DELETE FROM reference_ranges WHERE source = 'ARUP';--> statement-breakpoint

-- 6) 插入国标/通行口径行（sex/age 分列；unit NULL=字典基准单位；默认系统取罗氏）
INSERT INTO reference_ranges (metric_code, sex, age_min, age_max, range_low, range_high, range_text, source) VALUES
  -- 血常规（WS/T 405-2012）
  ('wbc',NULL,18,NULL,3.5,9.5,'3.5~9.5 ×10⁹/L','WS/T 405-2012'),
  ('mcv',NULL,18,NULL,82,100,'82~100 fL','WS/T 405-2012'),
  ('mch',NULL,18,NULL,27,34,'27~34 pg','WS/T 405-2012'),
  ('mchc',NULL,18,NULL,316,354,'316~354 g/L','WS/T 405-2012'),
  ('rdw',NULL,18,NULL,11.5,14.5,'11.5~14.5%','通行口径'),
  ('platelets',NULL,18,NULL,125,350,'125~350 ×10⁹/L','WS/T 405-2012'),
  ('mpv',NULL,18,NULL,6.5,12,'6.5~12 fL','通行口径'),
  ('rbc','male',18,NULL,4.3,5.8,'4.3~5.8 ×10¹²/L','WS/T 405-2012'),
  ('rbc','female',18,NULL,3.8,5.1,'3.8~5.1 ×10¹²/L','WS/T 405-2012'),
  ('hemoglobin','male',18,NULL,130,175,'130~175 g/L','WS/T 405-2012'),
  ('hemoglobin','female',18,NULL,115,150,'115~150 g/L','WS/T 405-2012'),
  ('hematocrit','male',18,NULL,40.0,50.0,'40~50%','WS/T 405-2012'),
  ('hematocrit','female',18,NULL,35.0,45.0,'35~45%','WS/T 405-2012'),
  -- 代谢
  ('glucose',NULL,18,NULL,3.9,6.1,'3.9~6.1 mmol/L（空腹）','通行口径'),
  ('sodium',NULL,18,NULL,137,147,'137~147 mmol/L','WS/T 404.3-2012'),
  ('potassium',NULL,18,NULL,3.5,5.3,'3.5~5.3 mmol/L','WS/T 404.3-2012'),
  ('chloride',NULL,18,NULL,99,110,'99~110 mmol/L','WS/T 404.3-2012'),
  ('co2',NULL,18,NULL,22,29,'22~29 mmol/L','通行口径'),
  ('calcium',NULL,18,NULL,2.11,2.52,'2.11~2.52 mmol/L','WS/T 404.6-2015'),
  ('total_protein',NULL,18,NULL,65,85,'65~85 g/L','WS/T 404.2-2012'),
  ('albumin',NULL,18,NULL,40,55,'40~55 g/L','WS/T 404.2-2012'),
  ('bilirubin_total','male',18,NULL,NULL,26.0,'≤26.0 μmol/L','WS/T 404.4-2018'),
  ('bilirubin_total','female',18,NULL,NULL,21.0,'≤21.0 μmol/L','WS/T 404.4-2018'),
  ('direct_bilirubin',NULL,18,NULL,NULL,8.0,'≤8.0 μmol/L（罗氏；贝克曼 ≤4.0，以报告单为准）','WS/T 404.4-2018'),
  ('alp','male',18,NULL,45,125,'45~125 U/L','WS/T 404.1-2012'),
  ('alp','female',18,49,35,100,'35~100 U/L','WS/T 404.1-2012'),
  ('alp','female',50,79,50,135,'50~135 U/L','WS/T 404.1-2012'),
  ('alt','male',18,NULL,9,50,'9~50 U/L','WS/T 404.1-2012'),
  ('alt','female',18,NULL,7,40,'7~40 U/L','WS/T 404.1-2012'),
  ('ast','male',18,NULL,15,40,'15~40 U/L','WS/T 404.1-2012'),
  ('ast','female',18,NULL,13,35,'13~35 U/L','WS/T 404.1-2012'),
  ('ggt','male',18,NULL,10,60,'10~60 U/L','WS/T 404.1-2012'),
  ('ggt','female',18,NULL,7,45,'7~45 U/L','WS/T 404.1-2012'),
  ('ldh',NULL,18,NULL,120,250,'120~250 U/L','WS/T 404.7-2015'),
  ('uric_acid','male',18,NULL,208,428,'208~428 μmol/L','通行口径'),
  ('uric_acid','female',18,NULL,155,357,'155~357 μmol/L','通行口径'),
  ('hemoglobin_a1c',NULL,18,NULL,4.0,6.0,'4.0~6.0%','通行口径'),
  ('insulin',NULL,18,NULL,2.6,24.9,'2.6~24.9 uIU/mL（空腹）','通行口径'),
  ('c_peptide',NULL,18,NULL,0.3,1.3,'0.3~1.3 nmol/L（空腹）','通行口径'),
  ('pth',NULL,18,NULL,15,65,'15~65 pg/mL','通行口径'),
  ('egfr',NULL,18,NULL,60,NULL,'≥60 mL/min/1.73m2（CKD 分期口径）','通行口径'),
  ('malb',NULL,18,NULL,0,30,'<30 mg/L','通行口径'),
  -- 尿素/肌酐（WS/T 404.5-2015，20-59/60-79 分列）
  ('bun','male',20,59,3.1,8.0,'3.1~8.0 mmol/L','WS/T 404.5-2015'),
  ('bun','male',60,79,3.6,9.5,'3.6~9.5 mmol/L','WS/T 404.5-2015'),
  ('bun','female',20,59,2.6,7.5,'2.6~7.5 mmol/L','WS/T 404.5-2015'),
  ('bun','female',60,79,3.1,8.8,'3.1~8.8 mmol/L','WS/T 404.5-2015'),
  ('creatinine','male',20,59,57,97,'57~97 μmol/L','WS/T 404.5-2015'),
  ('creatinine','male',60,79,57,111,'57~111 μmol/L','WS/T 404.5-2015'),
  ('creatinine','female',20,59,41,73,'41~73 μmol/L','WS/T 404.5-2015'),
  ('creatinine','female',60,79,41,81,'41~81 μmol/L','WS/T 404.5-2015'),
  -- 血脂（§9-② 中国血脂管理指南 2023，单侧）
  ('cholesterol_total',NULL,18,NULL,NULL,5.2,'合适水平 ≤5.2 mmol/L','中国血脂管理指南（2023）'),
  ('triglycerides',NULL,18,NULL,NULL,1.7,'合适水平 ≤1.7 mmol/L','中国血脂管理指南（2023）'),
  ('ldl_cholesterol',NULL,18,NULL,NULL,3.4,'合适水平 ≤3.4 mmol/L','中国血脂管理指南（2023）'),
  ('hdl_cholesterol',NULL,18,NULL,1.0,NULL,'合适水平 ≥1.0 mmol/L','中国血脂管理指南（2023）'),
  ('apoa1',NULL,18,NULL,1.00,1.60,'1.00~1.60 g/L','通行口径'),
  ('apob',NULL,18,NULL,0.60,1.10,'0.60~1.10 g/L','通行口径'),
  ('lp_a',NULL,18,NULL,NULL,300,'<300 mg/L','通行口径'),
  -- 炎症
  ('crp',NULL,18,NULL,NULL,6.0,'≤6.0 mg/L（非超敏试剂）','WS/T 404.9-2018'),
  ('hs_crp',NULL,18,NULL,NULL,3.0,'<3.0 mg/L','通行口径'),
  ('esr','male',18,NULL,0,15,'0~15 mm/hr','通行口径'),
  ('esr','female',18,NULL,0,20,'0~20 mm/hr','通行口径'),
  ('fibrinogen',NULL,18,NULL,2,4,'2~4 g/L','通行口径'),
  ('homocysteine',NULL,18,NULL,5,15,'5~15 μmol/L','通行口径'),
  -- 铁代谢
  ('iron','male',18,NULL,10.6,36.7,'10.6~36.7 μmol/L','WS/T 404.6-2015'),
  ('iron','female',18,NULL,7.8,32.2,'7.8~32.2 μmol/L','WS/T 404.6-2015'),
  ('tibc','male',18,NULL,50,77,'50~77 μmol/L','通行口径'),
  ('tibc','female',18,NULL,54,77,'54~77 μmol/L','通行口径'),
  ('transferrin_saturation',NULL,18,NULL,20,55,'20~55%','通行口径'),
  ('ferritin','male',18,NULL,18,270,'18~270 ng/mL','通行口径'),
  ('ferritin','female',18,NULL,18,160,'18~160 ng/mL','通行口径'),
  -- 甲状腺（化学发光法通行口径，方法依赖）
  ('tsh',NULL,18,NULL,0.27,4.2,'0.27~4.2 mIU/L','通行口径'),
  ('free_t3',NULL,18,NULL,3.1,6.8,'3.1~6.8 pmol/L','通行口径'),
  ('free_t4',NULL,18,NULL,12,22,'12~22 pmol/L','通行口径'),
  ('total_t3',NULL,18,NULL,1.3,3.1,'1.3~3.1 nmol/L','通行口径'),
  ('total_t4',NULL,18,NULL,66,181,'66~181 nmol/L','通行口径'),
  -- 心脏
  ('creatine_kinase','male',18,NULL,50,310,'50~310 U/L','WS/T 404.7-2015'),
  ('creatine_kinase','female',18,NULL,40,200,'40~200 U/L','WS/T 404.7-2015'),
  -- 激素（分期激素只收男性行；女性分期不进判定列，见 metric_definitions text）
  ('testosterone_total','male',18,NULL,8.64,29.0,'8.64~29.0 nmol/L','通行口径'),
  ('testosterone_total','female',18,NULL,1.3,2.8,'1.3~2.8 nmol/L','通行口径'),
  ('prolactin','male',18,NULL,4,15.2,'4~15.2 ng/mL','通行口径'),
  ('prolactin','female',18,NULL,3.34,25,'3.34~25 ng/mL（非孕期）','通行口径'),
  ('estradiol','male',18,NULL,8,36,'8~36 pg/mL','通行口径'),
  ('progesterone','male',18,NULL,0.4,0.84,'0.4~0.84 ng/mL','通行口径'),
  ('lh','male',18,NULL,1.7,8.6,'1.7~8.6 mIU/mL','通行口径'),
  ('fsh','male',18,NULL,1.5,12.4,'1.5~12.4 mIU/mL','通行口径'),
  ('cortisol',NULL,18,NULL,171,536,'171~536 nmol/L（上午 8 时采血）','通行口径'),
  -- 维生素
  ('vitamin_d',NULL,18,NULL,20,100,'20~100 ng/mL（<20 缺乏 / 20~30 不足 / ≥30 充足）','WS/T 677-2020'),
  ('vitamin_b12',NULL,18,NULL,200,900,'200~900 pg/mL','通行口径'),
  ('folate',NULL,18,NULL,5.4,18.0,'5.4~18.0 ng/mL（血清叶酸）','通行口径'),
  -- 生命体征
  ('heart_rate',NULL,18,NULL,60,100,'60~100 bpm','通行口径'),
  ('bp_systolic',NULL,18,NULL,90,120,'正常 <120 mmHg','中国高血压防治指南'),
  ('bp_diastolic',NULL,18,NULL,60,80,'正常 <80 mmHg','中国高血压防治指南'),
  ('temperature',NULL,18,NULL,36,37,'36~37 ℃','通行口径'),
  ('respiratory_rate',NULL,18,NULL,12,20,'12~20 次/分','通行口径'),
  ('spo2',NULL,18,NULL,95,100,'95~100%','通行口径'),
  ('bmi',NULL,18,NULL,18.5,23.9,'18.5~23.9（24~27.9 超重、≥28 肥胖）','WS/T 428-2013'),
  -- 肿瘤标志物（WS/T 645.2，单侧 ≤；系统特异取罗氏为默认）
  ('afp',NULL,18,NULL,NULL,7,'≤7 ng/mL','WS/T 645.2'),
  ('cea',NULL,18,NULL,NULL,5,'≤5 ng/mL','WS/T 645.2'),
  ('ca199',NULL,18,NULL,NULL,30,'≤30 U/mL（罗氏/系统a）','WS/T 645.2'),
  ('ca153',NULL,18,NULL,NULL,24,'≤24 U/mL（罗氏/系统a）','WS/T 645.2'),
  ('ca125','male',18,NULL,NULL,24,'≤24 U/mL','WS/T 645.2'),
  ('ca125','female',18,49,NULL,47,'≤47 U/mL','WS/T 645.2'),
  ('ca125','female',50,NULL,NULL,25,'≤25 U/mL','WS/T 645.2'),
  ('ca724',NULL,18,NULL,NULL,6.7,'≤6.7 U/mL','中国医药信息查询平台'),
  ('fpsa',NULL,18,NULL,NULL,0.8,'≤0.8 ng/mL','中国医药信息查询平台'),
  -- 尿液
  ('urine_ph',NULL,18,NULL,4.6,8.0,'4.6~8.0','通行口径'),
  ('specific_gravity',NULL,18,NULL,1.003,1.035,'1.003~1.035','通行口径'),
  ('urine_glucose',NULL,18,NULL,NULL,NULL,'阴性（干化学定性）','通行口径'),
  ('urine_protein',NULL,18,NULL,NULL,NULL,'阴性（干化学定性）','通行口径');--> statement-breakpoint

-- 7) 化验单区间学习回填（spec 19 §3.2-4 + 2026-10-12 用户拍板）：confirmed/corrected 且带原文区间的观测，
--    按 (metric_code, unit, low, high) 去重，unit=观测单位；
--    source 动态取观测行 metadata_json 的互认标识（如「陕HR」），无标识兜底「检验科区间」。
--    DISTINCT ON 同键优先取带互认标识的观测行。只 INSERT 不 UPDATE；
--    无单位的观测不收（unit NULL 保留给字典基准行）。
--    存量库（旧版 0018 已插 source='化验单学习'）由 0019 修正，本步只管新装机/未跑 0018 的库。
INSERT INTO reference_ranges (metric_code, sex, age_min, age_max, range_low, range_high, range_text, source, unit)
SELECT DISTINCT ON (o.metric_code, o.unit, o.reference_range_low, o.reference_range_high)
  o.metric_code, NULL, NULL::integer, NULL::integer, o.reference_range_low, o.reference_range_high, NULL,
  COALESCE(NULLIF(o.metadata_json->>'interopMark', ''), '检验科区间'), o.unit
FROM observations o
WHERE o.status IN ('confirmed','corrected')
  AND o.unit IS NOT NULL
  AND nullif(o.unit, '') IS NOT NULL
  AND (o.reference_range_low IS NOT NULL OR o.reference_range_high IS NOT NULL)
ORDER BY o.metric_code, o.unit, o.reference_range_low, o.reference_range_high,
  (NULLIF(o.metadata_json->>'interopMark', '') IS NOT NULL) DESC
ON CONFLICT DO NOTHING;
