/**
 * 字典中国化覆盖表（spec 19 v3 · 2026-10-12）
 *
 * 单一数值来源说明：本文件与迁移 `drizzle/0018_dict_china_ranges.sql` 的
 * UPDATE VALUES 必须逐条一致（数值底册 = 19-附录-字典中国化全量对照表-20261012.md）。
 * seed 只管新装机（bootstrap 时 onConflictDoNothing 插入）；存量库靠迁移 UPDATE。
 * 单位按报告实际写法落库（10^9/L / 10^12/L，生产库观测探针实证 2026-10-12），
 * 而非国标排版写法「×10⁹/L」——两者对单位门禁不等价，写错会导致血常规 fallback 全部被拦。
 */

export interface ChinaDictOverride {
  /** 仅 bun 需要改名称（尿素（BUN）） */
  name?: string;
  unit: string | null;
  referenceRangeLow: number | null;
  referenceRangeHigh: number | null;
  referenceRangeText: string | null;
}

export const CHINA_DICT_OVERRIDES: Record<string, ChinaDictOverride> = {
  // ── 血常规（WS/T 405-2012） ─────────────────────────────────────────────
  wbc: { unit: "10^9/L", referenceRangeLow: 3.5, referenceRangeHigh: 9.5, referenceRangeText: "3.5~9.5 ×10⁹/L（WS/T 405-2012）" },
  neutrophils_abs: { unit: "10^9/L", referenceRangeLow: 1.8, referenceRangeHigh: 6.3, referenceRangeText: "1.8~6.3 ×10⁹/L（WS/T 405-2012）" },
  lymphocytes_abs: { unit: "10^9/L", referenceRangeLow: 1.1, referenceRangeHigh: 3.2, referenceRangeText: "1.1~3.2 ×10⁹/L（WS/T 405-2012）" },
  monocytes_abs: { unit: "10^9/L", referenceRangeLow: 0.1, referenceRangeHigh: 0.6, referenceRangeText: "0.1~0.6 ×10⁹/L（WS/T 405-2012）" },
  eosinophils_abs: { unit: "10^9/L", referenceRangeLow: 0.02, referenceRangeHigh: 0.52, referenceRangeText: "0.02~0.52 ×10⁹/L（WS/T 405-2012）" },
  basophils_abs: { unit: "10^9/L", referenceRangeLow: 0, referenceRangeHigh: 0.06, referenceRangeText: "0~0.06 ×10⁹/L（WS/T 405-2012）" },
  neutrophils_pct: { unit: "%", referenceRangeLow: 40, referenceRangeHigh: 75, referenceRangeText: "40~75%（WS/T 405-2012）" },
  lymphocytes_pct: { unit: "%", referenceRangeLow: 20, referenceRangeHigh: 50, referenceRangeText: "20~50%（WS/T 405-2012）" },
  monocytes_pct: { unit: "%", referenceRangeLow: 3, referenceRangeHigh: 10, referenceRangeText: "3~10%（WS/T 405-2012）" },
  eosinophils_pct: { unit: "%", referenceRangeLow: 0.4, referenceRangeHigh: 8.0, referenceRangeText: "0.4~8.0%（WS/T 405-2012）" },
  basophils_pct: { unit: "%", referenceRangeLow: 0, referenceRangeHigh: 1, referenceRangeText: "0~1%（WS/T 405-2012）" },
  rbc: { unit: "10^12/L", referenceRangeLow: 4.3, referenceRangeHigh: 5.8, referenceRangeText: "男 4.3~5.8 / 女 3.8~5.1 ×10¹²/L（WS/T 405-2012）" },
  hemoglobin: { unit: "g/L", referenceRangeLow: 130, referenceRangeHigh: 175, referenceRangeText: "男 130~175 / 女 115~150 g/L（WS/T 405-2012）" },
  hematocrit: { unit: "%", referenceRangeLow: 40.0, referenceRangeHigh: 50.0, referenceRangeText: "男 40~50 / 女 35~45 %（WS/T 405-2012）" },
  mcv: { unit: "fL", referenceRangeLow: 82, referenceRangeHigh: 100, referenceRangeText: "82~100 fL（WS/T 405-2012）" },
  mch: { unit: "pg", referenceRangeLow: 27, referenceRangeHigh: 34, referenceRangeText: "27~34 pg（WS/T 405-2012）" },
  mchc: { unit: "g/L", referenceRangeLow: 316, referenceRangeHigh: 354, referenceRangeText: "316~354 g/L（WS/T 405-2012）" },
  platelets: { unit: "10^9/L", referenceRangeLow: 125, referenceRangeHigh: 350, referenceRangeText: "125~350 ×10⁹/L（WS/T 405-2012）" },
  mpv: { unit: "fL", referenceRangeLow: 6.5, referenceRangeHigh: 12, referenceRangeText: "6.5~12 fL（通行口径）" },
  // ── 代谢 ────────────────────────────────────────────────────────────────
  alt: { unit: "U/L", referenceRangeLow: 9, referenceRangeHigh: 50, referenceRangeText: "男 9~50 / 女 7~40 U/L（WS/T 404.1-2012）" },
  ast: { unit: "U/L", referenceRangeLow: 15, referenceRangeHigh: 40, referenceRangeText: "男 15~40 / 女 13~35 U/L（WS/T 404.1-2012）" },
  alp: { unit: "U/L", referenceRangeLow: 45, referenceRangeHigh: 125, referenceRangeText: "男 45~125；女 20-49 岁 35~100、50-79 岁 50~135 U/L（WS/T 404.1-2012）" },
  bilirubin_total: { unit: "μmol/L", referenceRangeLow: null, referenceRangeHigh: 26.0, referenceRangeText: "男 ≤26.0 / 女 ≤21.0 μmol/L（WS/T 404.4-2018，单侧）" },
  direct_bilirubin: { unit: "μmol/L", referenceRangeLow: null, referenceRangeHigh: 8.0, referenceRangeText: "≤8.0 μmol/L（罗氏/系统a；贝克曼 ≤4.0，以报告单为准。WS/T 404.4-2018）" },
  bun: { name: "尿素（BUN）", unit: "mmol/L", referenceRangeLow: 3.1, referenceRangeHigh: 8.0, referenceRangeText: "男 20-59 岁 3.1~8.0、60-79 岁 3.6~9.5；女 20-59 岁 2.6~7.5、60-79 岁 3.1~8.8 mmol/L（WS/T 404.5-2015）" },
  creatinine: { unit: "μmol/L", referenceRangeLow: 57, referenceRangeHigh: 97, referenceRangeText: "男 57~97（60-79 岁 57~111）/ 女 41~73（60-79 岁 41~81）μmol/L（WS/T 404.5-2015）" },
  uric_acid: { unit: "μmol/L", referenceRangeLow: 208, referenceRangeHigh: 428, referenceRangeText: "男 208~428 / 女 155~357 μmol/L（通行口径）" },
  glucose: { unit: "mmol/L", referenceRangeLow: 3.9, referenceRangeHigh: 6.1, referenceRangeText: "3.9~6.1 mmol/L（空腹，通行口径）" },
  calcium: { unit: "mmol/L", referenceRangeLow: 2.11, referenceRangeHigh: 2.52, referenceRangeText: "2.11~2.52 mmol/L（WS/T 404.6-2015）" },
  magnesium: { unit: "mmol/L", referenceRangeLow: 0.75, referenceRangeHigh: 1.02, referenceRangeText: "0.75~1.02 mmol/L（WS/T 404.6-2015）" },
  phosphate: { unit: "mmol/L", referenceRangeLow: 0.85, referenceRangeHigh: 1.51, referenceRangeText: "0.85~1.51 mmol/L（WS/T 404.6-2015）" },
  potassium: { unit: "mmol/L", referenceRangeLow: 3.5, referenceRangeHigh: 5.3, referenceRangeText: "3.5~5.3 mmol/L（WS/T 404.3-2012）" },
  sodium: { unit: "mmol/L", referenceRangeLow: 137, referenceRangeHigh: 147, referenceRangeText: "137~147 mmol/L（WS/T 404.3-2012）" },
  chloride: { unit: "mmol/L", referenceRangeLow: 99, referenceRangeHigh: 110, referenceRangeText: "99~110 mmol/L（WS/T 404.3-2012）" },
  co2: { unit: "mmol/L", referenceRangeLow: 22, referenceRangeHigh: 29, referenceRangeText: "22~29 mmol/L（通行口径）" },
  total_protein: { unit: "g/L", referenceRangeLow: 65, referenceRangeHigh: 85, referenceRangeText: "65~85 g/L（WS/T 404.2-2012）" },
  albumin: { unit: "g/L", referenceRangeLow: 40, referenceRangeHigh: 55, referenceRangeText: "40~55 g/L（WS/T 404.2-2012）" },
  globulin: { unit: "g/L", referenceRangeLow: 20, referenceRangeHigh: 40, referenceRangeText: "20~40 g/L（通行口径）" },
  albumin_globulin_ratio: { unit: null, referenceRangeLow: 1.2, referenceRangeHigh: 2.4, referenceRangeText: "1.2~2.4（通行口径）" },
  hemoglobin_a1c: { unit: "%", referenceRangeLow: 4.0, referenceRangeHigh: 6.0, referenceRangeText: "4.0~6.0%（正常 <6.0，通行口径）" },
  ldh: { unit: "U/L", referenceRangeLow: 120, referenceRangeHigh: 250, referenceRangeText: "120~250 U/L（WS/T 404.7-2015）" },
  c_peptide: { unit: "nmol/L", referenceRangeLow: 0.3, referenceRangeHigh: 1.3, referenceRangeText: "0.3~1.3 nmol/L（空腹，通行口径）" },
  lipase: { unit: "U/L", referenceRangeLow: null, referenceRangeHigh: null, referenceRangeText: "以报告单为准（仪器依赖大）" },
  // ── 肾 ──────────────────────────────────────────────────────────────────
  bun_creatinine_ratio: { unit: null, referenceRangeLow: null, referenceRangeHigh: null, referenceRangeText: "以报告单为准（单位换算后 mg/dL 比值无意义）" },
  uacr: { unit: "mg/g", referenceRangeLow: null, referenceRangeHigh: 30, referenceRangeText: "<30 mg/g（通行口径）" },
  // ── 血脂（§9-② 指南单侧） ────────────────────────────────────────────────
  cholesterol_total: { unit: "mmol/L", referenceRangeLow: null, referenceRangeHigh: 5.2, referenceRangeText: "合适水平 ≤5.2 mmol/L（中国血脂管理指南 2023）" },
  triglycerides: { unit: "mmol/L", referenceRangeLow: null, referenceRangeHigh: 1.7, referenceRangeText: "合适水平 ≤1.7 mmol/L（中国血脂管理指南 2023）" },
  ldl_cholesterol: { unit: "mmol/L", referenceRangeLow: null, referenceRangeHigh: 3.4, referenceRangeText: "合适水平 ≤3.4 mmol/L（中国血脂管理指南 2023）" },
  hdl_cholesterol: { unit: "mmol/L", referenceRangeLow: 1.0, referenceRangeHigh: null, referenceRangeText: "合适水平 ≥1.0 mmol/L（中国血脂管理指南 2023）" },
  non_hdl_cholesterol: { unit: "mmol/L", referenceRangeLow: null, referenceRangeHigh: 4.1, referenceRangeText: "合适水平 ≤4.1 mmol/L（中国血脂管理指南 2023）" },
  apoa1: { unit: "g/L", referenceRangeLow: 1.00, referenceRangeHigh: 1.60, referenceRangeText: "1.00~1.60 g/L（通行口径）" },
  apob: { unit: "g/L", referenceRangeLow: 0.60, referenceRangeHigh: 1.10, referenceRangeText: "0.60~1.10 g/L（通行口径）" },
  vldl_cholesterol: { unit: null, referenceRangeLow: null, referenceRangeHigh: null, referenceRangeText: "以报告单为准（中国极少单列，可由 TG/2.2 推算）" },
  lp_a: { unit: "mg/L", referenceRangeLow: null, referenceRangeHigh: 300, referenceRangeText: "<300 mg/L（通行口径）" },
  oxidized_ldl: { unit: "U/L", referenceRangeLow: 0, referenceRangeHigh: 60, referenceRangeText: "以报告单为准（小众项目，无通行国标）" },
  // ── 炎症 ────────────────────────────────────────────────────────────────
  crp: { unit: "mg/L", referenceRangeLow: null, referenceRangeHigh: 6.0, referenceRangeText: "≤6.0 mg/L（非超敏试剂，WS/T 404.9-2018）" },
  hs_crp: { unit: "mg/L", referenceRangeLow: null, referenceRangeHigh: 3.0, referenceRangeText: "<3.0 mg/L（通行口径）" },
  esr: { unit: "mm/hr", referenceRangeLow: 0, referenceRangeHigh: 15, referenceRangeText: "男 0~15 / 女 0~20 mm/hr（通行口径）" },
  fibrinogen: { unit: "g/L", referenceRangeLow: 2, referenceRangeHigh: 4, referenceRangeText: "2~4 g/L（通行口径）" },
  homocysteine: { unit: "μmol/L", referenceRangeLow: 5, referenceRangeHigh: 15, referenceRangeText: "5~15 μmol/L（通行口径）" },
  // ── 铁代谢 ──────────────────────────────────────────────────────────────
  iron: { unit: "μmol/L", referenceRangeLow: 10.6, referenceRangeHigh: 36.7, referenceRangeText: "男 10.6~36.7 / 女 7.8~32.2 μmol/L（WS/T 404.6-2015）" },
  tibc: { unit: "μmol/L", referenceRangeLow: 50, referenceRangeHigh: 77, referenceRangeText: "男 50~77 / 女 54~77 μmol/L（通行口径）" },
  ferritin: { unit: "ng/mL", referenceRangeLow: 18, referenceRangeHigh: 270, referenceRangeText: "男 18~270 / 女 18~160 ng/mL（通行口径）" },
  transferrin_saturation: { unit: "%", referenceRangeLow: 20, referenceRangeHigh: 55, referenceRangeText: "20~55%（通行口径）" },
  // ── 甲状腺（化学发光法通行口径，方法依赖） ────────────────────────────────
  tsh: { unit: "mIU/L", referenceRangeLow: 0.27, referenceRangeHigh: 4.2, referenceRangeText: "0.27~4.2 mIU/L（化学发光法通行口径，以报告单为准）" },
  free_t3: { unit: "pmol/L", referenceRangeLow: 3.1, referenceRangeHigh: 6.8, referenceRangeText: "3.1~6.8 pmol/L（化学发光法通行口径，以报告单为准）" },
  free_t4: { unit: "pmol/L", referenceRangeLow: 12, referenceRangeHigh: 22, referenceRangeText: "12~22 pmol/L（化学发光法通行口径，以报告单为准）" },
  total_t3: { unit: "nmol/L", referenceRangeLow: 1.3, referenceRangeHigh: 3.1, referenceRangeText: "1.3~3.1 nmol/L（化学发光法通行口径，以报告单为准）" },
  total_t4: { unit: "nmol/L", referenceRangeLow: 66, referenceRangeHigh: 181, referenceRangeText: "66~181 nmol/L（化学发光法通行口径，以报告单为准）" },
  tpo_antibodies: { unit: "IU/mL", referenceRangeLow: null, referenceRangeHigh: 60, referenceRangeText: "≤60 IU/mL（化学发光法通行口径）" },
  reverse_t3: { unit: "ng/dL", referenceRangeLow: 9.2, referenceRangeHigh: 24.1, referenceRangeText: "方法依赖，以报告单为准" },
  // ── 肝 ──────────────────────────────────────────────────────────────────
  ggt: { unit: "U/L", referenceRangeLow: 10, referenceRangeHigh: 60, referenceRangeText: "男 10~60 / 女 7~45 U/L（WS/T 404.1-2012）" },
  indirect_bilirubin: { unit: "μmol/L", referenceRangeLow: 1.7, referenceRangeHigh: 10.2, referenceRangeText: "1.7~10.2 μmol/L（通行口径）" },
  // ── 心脏 ────────────────────────────────────────────────────────────────
  creatine_kinase: { unit: "U/L", referenceRangeLow: 50, referenceRangeHigh: 310, referenceRangeText: "男 50~310 / 女 40~200 U/L（WS/T 404.7-2015）" },
  ck_mb: { unit: "ng/mL", referenceRangeLow: 0, referenceRangeHigh: 5, referenceRangeText: "方法依赖，以报告单为准" },
  troponin_i: { unit: "ng/mL", referenceRangeLow: 0, referenceRangeHigh: 0.04, referenceRangeText: "方法依赖（超敏法各厂商 cutoff 不同），以报告单为准" },
  bnp: { unit: "pg/mL", referenceRangeLow: 0, referenceRangeHigh: 100, referenceRangeText: "年龄分层，以报告单为准" },
  // ── 激素（分期激素区间不进判定列：low/high 置空，分期表进 text） ────────────
  fsh: { unit: "mIU/mL", referenceRangeLow: null, referenceRangeHigh: null, referenceRangeText: "男 1.5~12.4；女卵泡期 3.5~12.5 / 排卵期 4.7~21.5 / 黄体期 1.7~7.7 / 绝经后 25.8~134.8 mIU/mL（月经第2-4天采血口径，其他阶段以报告单为准）" },
  lh: { unit: "mIU/mL", referenceRangeLow: null, referenceRangeHigh: null, referenceRangeText: "男 1.7~8.6；女卵泡期 2.4~12.6 / 排卵期 14~95.6 / 黄体期 1.0~11.4 / 绝经后 7.7~58.5 mIU/mL（月经第2-4天采血口径，其他阶段以报告单为准）" },
  estradiol: { unit: "pg/mL", referenceRangeLow: null, referenceRangeHigh: null, referenceRangeText: "男 8~36；女卵泡期 24~114 / 排卵期 62~534 / 黄体期 80~273 / 绝经后 20~88 pg/mL（月经第2-4天采血口径，其他阶段以报告单为准）" },
  progesterone: { unit: "ng/mL", referenceRangeLow: null, referenceRangeHigh: null, referenceRangeText: "男 0.4~0.84；女卵泡期 0.31~1.52 / 黄体期 5.16~18.56 / 绝经后 <0.78 ng/mL（分期口径，以报告单为准）" },
  prolactin: { unit: "ng/mL", referenceRangeLow: 4, referenceRangeHigh: 15.2, referenceRangeText: "男 4~15.2 / 女 3.34~25 ng/mL（非孕期，通行口径）" },
  testosterone_total: { unit: "nmol/L", referenceRangeLow: 8.64, referenceRangeHigh: 29.0, referenceRangeText: "男 8.64~29.0 / 女 1.3~2.8 nmol/L（通行口径）" },
  free_testosterone: { unit: "pg/mL", referenceRangeLow: null, referenceRangeHigh: null, referenceRangeText: "方法依赖，以报告单为准" },
  cortisol: { unit: "nmol/L", referenceRangeLow: 171, referenceRangeHigh: 536, referenceRangeText: "171~536 nmol/L（上午 8 时采血；昼夜节律强，其他时段以报告单为准）" },
  dhea_s: { unit: "mcg/dL", referenceRangeLow: null, referenceRangeHigh: null, referenceRangeText: "性别年龄分层，以报告单为准" },
  leptin: { unit: "ng/mL", referenceRangeLow: null, referenceRangeHigh: null, referenceRangeText: "以报告单为准（小众项目，无通行国标）" },
  pth: { unit: "pg/mL", referenceRangeLow: 15, referenceRangeHigh: 65, referenceRangeText: "15~65 pg/mL（化学发光，通行口径）" },
  // ── 维生素 ──────────────────────────────────────────────────────────────
  vitamin_d: { unit: "ng/mL", referenceRangeLow: 20, referenceRangeHigh: 100, referenceRangeText: "20~100 ng/mL；<20 缺乏 / 20~30 不足 / ≥30 充足（WS/T 677-2020）" },
  folate: { unit: "ng/mL", referenceRangeLow: 5.4, referenceRangeHigh: 18.0, referenceRangeText: "5.4~18.0 ng/mL（血清叶酸，通行口径）" },
  copper: { unit: "μmol/L", referenceRangeLow: 11.0, referenceRangeHigh: 22.0, referenceRangeText: "11.0~22.0 μmol/L（通行口径）" },
  zinc: { unit: "μmol/L", referenceRangeLow: 11.5, referenceRangeHigh: 18.4, referenceRangeText: "11.5~18.4 μmol/L（通行口径）" },
  selenium: { unit: "μg/L", referenceRangeLow: 63, referenceRangeHigh: 160, referenceRangeText: "63~160 μg/L（通行口径）" },
  // ── 生命体征 ────────────────────────────────────────────────────────────
  bmi: { unit: "kg/m2", referenceRangeLow: 18.5, referenceRangeHigh: 23.9, referenceRangeText: "18.5~23.9（WS/T 428-2013；24~27.9 超重、≥28 肥胖）" },
  temperature: { unit: "℃", referenceRangeLow: 36, referenceRangeHigh: 37, referenceRangeText: "36~37 ℃（通行口径）" },
  height: { unit: "cm", referenceRangeLow: null, referenceRangeHigh: null, referenceRangeText: null },
  weight: { unit: "kg", referenceRangeLow: null, referenceRangeHigh: null, referenceRangeText: null },
  // ── 肿瘤标志物（WS/T 645.2，单侧 ≤；系统特异取罗氏为默认） ──────────────────
  afp: { unit: "ng/mL", referenceRangeLow: null, referenceRangeHigh: 7, referenceRangeText: "≤7 ng/mL（WS/T 645.2）" },
  cea: { unit: "ng/mL", referenceRangeLow: null, referenceRangeHigh: 5, referenceRangeText: "≤5 ng/mL（WS/T 645.2）" },
  ca199: { unit: "U/mL", referenceRangeLow: null, referenceRangeHigh: 30, referenceRangeText: "≤30 U/mL（罗氏/系统a；贝克曼 ≤25、西门子 ≤34、雅培 ≤43，以报告单为准）" },
  ca153: { unit: "U/mL", referenceRangeLow: null, referenceRangeHigh: 24, referenceRangeText: "≤24 U/mL（罗氏/系统a；其他系统 ≤15~20，以报告单为准）" },
  ca125: { unit: "U/mL", referenceRangeLow: null, referenceRangeHigh: 24, referenceRangeText: "男 ≤24；女 18-49 岁 ≤47、≥50 岁 ≤25 U/mL（WS/T 645.2，罗氏/系统a）" },
  ca724: { unit: "U/mL", referenceRangeLow: null, referenceRangeHigh: 6.7, referenceRangeText: "≤6.7 U/mL（中国医药信息查询平台）" },
  fpsa: { unit: "ng/mL", referenceRangeLow: null, referenceRangeHigh: 0.8, referenceRangeText: "≤0.8 ng/mL（f-PSA）" },
  // ── 尿液（尿糖/尿蛋白改定性口径：§9 拍板） ────────────────────────────────
  specific_gravity: { unit: null, referenceRangeLow: 1.003, referenceRangeHigh: 1.035, referenceRangeText: "1.003~1.035（通行口径）" },
  urine_ph: { unit: null, referenceRangeLow: 4.6, referenceRangeHigh: 8.0, referenceRangeText: "4.6~8.0（通行口径）" },
  urine_glucose: { unit: null, referenceRangeLow: null, referenceRangeHigh: null, referenceRangeText: "阴性（干化学定性）" },
  urine_protein: { unit: null, referenceRangeLow: null, referenceRangeHigh: null, referenceRangeText: "阴性（干化学定性）" },
};
