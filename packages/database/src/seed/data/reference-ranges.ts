export interface ReferenceRangeSeed {
  metricCode: string;
  sex: string | null;
  ageMin: number | null;
  ageMax: number | null;
  rangeLow: number | null;
  rangeHigh: number | null;
  rangeText: string | null;
  source: string;
  /**
   * spec 19（v0.1.14）：NULL = 字典基准单位行（国标/通行口径）；
   * 非 NULL = 化验单学习行。seed 只负责新装机，学习行由运行时 confirm/correct 写入，
   * 因此本表全部为 NULL。
   */
  unit: string | null;
}

// 中国标准行（spec 19 §3.2：ARUP 87 行整体替换为来源标注的国标/通行行；
// 与迁移 drizzle/0018_dict_china_ranges.sql 的 INSERT 逐条一致；数值底册 = 19-附录）。
export const referenceRangeSeeds: ReferenceRangeSeed[] = [
  // ── 血常规（WS/T 405-2012） ────────────────────────────────────────────
  { metricCode: 'wbc', sex: null, ageMin: 18, ageMax: null, rangeLow: 3.5, rangeHigh: 9.5, rangeText: '3.5~9.5 ×10⁹/L', source: 'WS/T 405-2012', unit: null },
  { metricCode: 'mcv', sex: null, ageMin: 18, ageMax: null, rangeLow: 82, rangeHigh: 100, rangeText: '82~100 fL', source: 'WS/T 405-2012', unit: null },
  { metricCode: 'mch', sex: null, ageMin: 18, ageMax: null, rangeLow: 27, rangeHigh: 34, rangeText: '27~34 pg', source: 'WS/T 405-2012', unit: null },
  { metricCode: 'mchc', sex: null, ageMin: 18, ageMax: null, rangeLow: 316, rangeHigh: 354, rangeText: '316~354 g/L', source: 'WS/T 405-2012', unit: null },
  { metricCode: 'rdw', sex: null, ageMin: 18, ageMax: null, rangeLow: 11.5, rangeHigh: 14.5, rangeText: '11.5~14.5%', source: '通行口径', unit: null },
  { metricCode: 'platelets', sex: null, ageMin: 18, ageMax: null, rangeLow: 125, rangeHigh: 350, rangeText: '125~350 ×10⁹/L', source: 'WS/T 405-2012', unit: null },
  { metricCode: 'mpv', sex: null, ageMin: 18, ageMax: null, rangeLow: 6.5, rangeHigh: 12, rangeText: '6.5~12 fL', source: '通行口径', unit: null },
  { metricCode: 'rbc', sex: 'male', ageMin: 18, ageMax: null, rangeLow: 4.3, rangeHigh: 5.8, rangeText: '4.3~5.8 ×10¹²/L', source: 'WS/T 405-2012', unit: null },
  { metricCode: 'rbc', sex: 'female', ageMin: 18, ageMax: null, rangeLow: 3.8, rangeHigh: 5.1, rangeText: '3.8~5.1 ×10¹²/L', source: 'WS/T 405-2012', unit: null },
  { metricCode: 'hemoglobin', sex: 'male', ageMin: 18, ageMax: null, rangeLow: 130, rangeHigh: 175, rangeText: '130~175 g/L', source: 'WS/T 405-2012', unit: null },
  { metricCode: 'hemoglobin', sex: 'female', ageMin: 18, ageMax: null, rangeLow: 115, rangeHigh: 150, rangeText: '115~150 g/L', source: 'WS/T 405-2012', unit: null },
  { metricCode: 'hematocrit', sex: 'male', ageMin: 18, ageMax: null, rangeLow: 40.0, rangeHigh: 50.0, rangeText: '40~50%', source: 'WS/T 405-2012', unit: null },
  { metricCode: 'hematocrit', sex: 'female', ageMin: 18, ageMax: null, rangeLow: 35.0, rangeHigh: 45.0, rangeText: '35~45%', source: 'WS/T 405-2012', unit: null },
  // ── 代谢 ───────────────────────────────────────────────────────────────
  { metricCode: 'glucose', sex: null, ageMin: 18, ageMax: null, rangeLow: 3.9, rangeHigh: 6.1, rangeText: '3.9~6.1 mmol/L（空腹）', source: '通行口径', unit: null },
  { metricCode: 'sodium', sex: null, ageMin: 18, ageMax: null, rangeLow: 137, rangeHigh: 147, rangeText: '137~147 mmol/L', source: 'WS/T 404.3-2012', unit: null },
  { metricCode: 'potassium', sex: null, ageMin: 18, ageMax: null, rangeLow: 3.5, rangeHigh: 5.3, rangeText: '3.5~5.3 mmol/L', source: 'WS/T 404.3-2012', unit: null },
  { metricCode: 'chloride', sex: null, ageMin: 18, ageMax: null, rangeLow: 99, rangeHigh: 110, rangeText: '99~110 mmol/L', source: 'WS/T 404.3-2012', unit: null },
  { metricCode: 'co2', sex: null, ageMin: 18, ageMax: null, rangeLow: 22, rangeHigh: 29, rangeText: '22~29 mmol/L', source: '通行口径', unit: null },
  { metricCode: 'calcium', sex: null, ageMin: 18, ageMax: null, rangeLow: 2.11, rangeHigh: 2.52, rangeText: '2.11~2.52 mmol/L', source: 'WS/T 404.6-2015', unit: null },
  { metricCode: 'total_protein', sex: null, ageMin: 18, ageMax: null, rangeLow: 65, rangeHigh: 85, rangeText: '65~85 g/L', source: 'WS/T 404.2-2012', unit: null },
  { metricCode: 'albumin', sex: null, ageMin: 18, ageMax: null, rangeLow: 40, rangeHigh: 55, rangeText: '40~55 g/L', source: 'WS/T 404.2-2012', unit: null },
  { metricCode: 'bilirubin_total', sex: 'male', ageMin: 18, ageMax: null, rangeLow: null, rangeHigh: 26.0, rangeText: '≤26.0 μmol/L', source: 'WS/T 404.4-2018', unit: null },
  { metricCode: 'bilirubin_total', sex: 'female', ageMin: 18, ageMax: null, rangeLow: null, rangeHigh: 21.0, rangeText: '≤21.0 μmol/L', source: 'WS/T 404.4-2018', unit: null },
  { metricCode: 'direct_bilirubin', sex: null, ageMin: 18, ageMax: null, rangeLow: null, rangeHigh: 8.0, rangeText: '≤8.0 μmol/L（罗氏；贝克曼 ≤4.0，以报告单为准）', source: 'WS/T 404.4-2018', unit: null },
  { metricCode: 'alp', sex: 'male', ageMin: 18, ageMax: null, rangeLow: 45, rangeHigh: 125, rangeText: '45~125 U/L', source: 'WS/T 404.1-2012', unit: null },
  { metricCode: 'alp', sex: 'female', ageMin: 18, ageMax: 49, rangeLow: 35, rangeHigh: 100, rangeText: '35~100 U/L', source: 'WS/T 404.1-2012', unit: null },
  { metricCode: 'alp', sex: 'female', ageMin: 50, ageMax: 79, rangeLow: 50, rangeHigh: 135, rangeText: '50~135 U/L', source: 'WS/T 404.1-2012', unit: null },
  { metricCode: 'alt', sex: 'male', ageMin: 18, ageMax: null, rangeLow: 9, rangeHigh: 50, rangeText: '9~50 U/L', source: 'WS/T 404.1-2012', unit: null },
  { metricCode: 'alt', sex: 'female', ageMin: 18, ageMax: null, rangeLow: 7, rangeHigh: 40, rangeText: '7~40 U/L', source: 'WS/T 404.1-2012', unit: null },
  { metricCode: 'ast', sex: 'male', ageMin: 18, ageMax: null, rangeLow: 15, rangeHigh: 40, rangeText: '15~40 U/L', source: 'WS/T 404.1-2012', unit: null },
  { metricCode: 'ast', sex: 'female', ageMin: 18, ageMax: null, rangeLow: 13, rangeHigh: 35, rangeText: '13~35 U/L', source: 'WS/T 404.1-2012', unit: null },
  { metricCode: 'ggt', sex: 'male', ageMin: 18, ageMax: null, rangeLow: 10, rangeHigh: 60, rangeText: '10~60 U/L', source: 'WS/T 404.1-2012', unit: null },
  { metricCode: 'ggt', sex: 'female', ageMin: 18, ageMax: null, rangeLow: 7, rangeHigh: 45, rangeText: '7~45 U/L', source: 'WS/T 404.1-2012', unit: null },
  { metricCode: 'ldh', sex: null, ageMin: 18, ageMax: null, rangeLow: 120, rangeHigh: 250, rangeText: '120~250 U/L', source: 'WS/T 404.7-2015', unit: null },
  { metricCode: 'uric_acid', sex: 'male', ageMin: 18, ageMax: null, rangeLow: 208, rangeHigh: 428, rangeText: '208~428 μmol/L', source: '通行口径', unit: null },
  { metricCode: 'uric_acid', sex: 'female', ageMin: 18, ageMax: null, rangeLow: 155, rangeHigh: 357, rangeText: '155~357 μmol/L', source: '通行口径', unit: null },
  { metricCode: 'hemoglobin_a1c', sex: null, ageMin: 18, ageMax: null, rangeLow: 4.0, rangeHigh: 6.0, rangeText: '4.0~6.0%', source: '通行口径', unit: null },
  { metricCode: 'insulin', sex: null, ageMin: 18, ageMax: null, rangeLow: 2.6, rangeHigh: 24.9, rangeText: '2.6~24.9 uIU/mL（空腹）', source: '通行口径', unit: null },
  { metricCode: 'c_peptide', sex: null, ageMin: 18, ageMax: null, rangeLow: 0.3, rangeHigh: 1.3, rangeText: '0.3~1.3 nmol/L（空腹）', source: '通行口径', unit: null },
  { metricCode: 'pth', sex: null, ageMin: 18, ageMax: null, rangeLow: 15, rangeHigh: 65, rangeText: '15~65 pg/mL', source: '通行口径', unit: null },
  { metricCode: 'egfr', sex: null, ageMin: 18, ageMax: null, rangeLow: 60, rangeHigh: null, rangeText: '≥60 mL/min/1.73m2（CKD 分期口径）', source: '通行口径', unit: null },
  { metricCode: 'malb', sex: null, ageMin: 18, ageMax: null, rangeLow: 0, rangeHigh: 30, rangeText: '<30 mg/L', source: '通行口径', unit: null },
  // ── 尿素/肌酐（WS/T 404.5-2015，20-59/60-79 分列） ────────────────────────
  { metricCode: 'bun', sex: 'male', ageMin: 20, ageMax: 59, rangeLow: 3.1, rangeHigh: 8.0, rangeText: '3.1~8.0 mmol/L', source: 'WS/T 404.5-2015', unit: null },
  { metricCode: 'bun', sex: 'male', ageMin: 60, ageMax: 79, rangeLow: 3.6, rangeHigh: 9.5, rangeText: '3.6~9.5 mmol/L', source: 'WS/T 404.5-2015', unit: null },
  { metricCode: 'bun', sex: 'female', ageMin: 20, ageMax: 59, rangeLow: 2.6, rangeHigh: 7.5, rangeText: '2.6~7.5 mmol/L', source: 'WS/T 404.5-2015', unit: null },
  { metricCode: 'bun', sex: 'female', ageMin: 60, ageMax: 79, rangeLow: 3.1, rangeHigh: 8.8, rangeText: '3.1~8.8 mmol/L', source: 'WS/T 404.5-2015', unit: null },
  { metricCode: 'creatinine', sex: 'male', ageMin: 20, ageMax: 59, rangeLow: 57, rangeHigh: 97, rangeText: '57~97 μmol/L', source: 'WS/T 404.5-2015', unit: null },
  { metricCode: 'creatinine', sex: 'male', ageMin: 60, ageMax: 79, rangeLow: 57, rangeHigh: 111, rangeText: '57~111 μmol/L', source: 'WS/T 404.5-2015', unit: null },
  { metricCode: 'creatinine', sex: 'female', ageMin: 20, ageMax: 59, rangeLow: 41, rangeHigh: 73, rangeText: '41~73 μmol/L', source: 'WS/T 404.5-2015', unit: null },
  { metricCode: 'creatinine', sex: 'female', ageMin: 60, ageMax: 79, rangeLow: 41, rangeHigh: 81, rangeText: '41~81 μmol/L', source: 'WS/T 404.5-2015', unit: null },
  // ── 血脂（§9-② 中国血脂管理指南 2023，单侧） ──────────────────────────────
  { metricCode: 'cholesterol_total', sex: null, ageMin: 18, ageMax: null, rangeLow: null, rangeHigh: 5.2, rangeText: '合适水平 ≤5.2 mmol/L', source: '中国血脂管理指南（2023）', unit: null },
  { metricCode: 'triglycerides', sex: null, ageMin: 18, ageMax: null, rangeLow: null, rangeHigh: 1.7, rangeText: '合适水平 ≤1.7 mmol/L', source: '中国血脂管理指南（2023）', unit: null },
  { metricCode: 'ldl_cholesterol', sex: null, ageMin: 18, ageMax: null, rangeLow: null, rangeHigh: 3.4, rangeText: '合适水平 ≤3.4 mmol/L', source: '中国血脂管理指南（2023）', unit: null },
  { metricCode: 'hdl_cholesterol', sex: null, ageMin: 18, ageMax: null, rangeLow: 1.0, rangeHigh: null, rangeText: '合适水平 ≥1.0 mmol/L', source: '中国血脂管理指南（2023）', unit: null },
  { metricCode: 'apoa1', sex: null, ageMin: 18, ageMax: null, rangeLow: 1.00, rangeHigh: 1.60, rangeText: '1.00~1.60 g/L', source: '通行口径', unit: null },
  { metricCode: 'apob', sex: null, ageMin: 18, ageMax: null, rangeLow: 0.60, rangeHigh: 1.10, rangeText: '0.60~1.10 g/L', source: '通行口径', unit: null },
  { metricCode: 'lp_a', sex: null, ageMin: 18, ageMax: null, rangeLow: null, rangeHigh: 300, rangeText: '<300 mg/L', source: '通行口径', unit: null },
  // ── 炎症 ───────────────────────────────────────────────────────────────
  { metricCode: 'crp', sex: null, ageMin: 18, ageMax: null, rangeLow: null, rangeHigh: 6.0, rangeText: '≤6.0 mg/L（非超敏试剂）', source: 'WS/T 404.9-2018', unit: null },
  { metricCode: 'hs_crp', sex: null, ageMin: 18, ageMax: null, rangeLow: null, rangeHigh: 3.0, rangeText: '<3.0 mg/L', source: '通行口径', unit: null },
  { metricCode: 'esr', sex: 'male', ageMin: 18, ageMax: null, rangeLow: 0, rangeHigh: 15, rangeText: '0~15 mm/hr', source: '通行口径', unit: null },
  { metricCode: 'esr', sex: 'female', ageMin: 18, ageMax: null, rangeLow: 0, rangeHigh: 20, rangeText: '0~20 mm/hr', source: '通行口径', unit: null },
  { metricCode: 'fibrinogen', sex: null, ageMin: 18, ageMax: null, rangeLow: 2, rangeHigh: 4, rangeText: '2~4 g/L', source: '通行口径', unit: null },
  { metricCode: 'homocysteine', sex: null, ageMin: 18, ageMax: null, rangeLow: 5, rangeHigh: 15, rangeText: '5~15 μmol/L', source: '通行口径', unit: null },
  // ── 铁代谢 ─────────────────────────────────────────────────────────────
  { metricCode: 'iron', sex: 'male', ageMin: 18, ageMax: null, rangeLow: 10.6, rangeHigh: 36.7, rangeText: '10.6~36.7 μmol/L', source: 'WS/T 404.6-2015', unit: null },
  { metricCode: 'iron', sex: 'female', ageMin: 18, ageMax: null, rangeLow: 7.8, rangeHigh: 32.2, rangeText: '7.8~32.2 μmol/L', source: 'WS/T 404.6-2015', unit: null },
  { metricCode: 'tibc', sex: 'male', ageMin: 18, ageMax: null, rangeLow: 50, rangeHigh: 77, rangeText: '50~77 μmol/L', source: '通行口径', unit: null },
  { metricCode: 'tibc', sex: 'female', ageMin: 18, ageMax: null, rangeLow: 54, rangeHigh: 77, rangeText: '54~77 μmol/L', source: '通行口径', unit: null },
  { metricCode: 'transferrin_saturation', sex: null, ageMin: 18, ageMax: null, rangeLow: 20, rangeHigh: 55, rangeText: '20~55%', source: '通行口径', unit: null },
  { metricCode: 'ferritin', sex: 'male', ageMin: 18, ageMax: null, rangeLow: 18, rangeHigh: 270, rangeText: '18~270 ng/mL', source: '通行口径', unit: null },
  { metricCode: 'ferritin', sex: 'female', ageMin: 18, ageMax: null, rangeLow: 18, rangeHigh: 160, rangeText: '18~160 ng/mL', source: '通行口径', unit: null },
  // ── 甲状腺（化学发光法通行口径，方法依赖） ───────────────────────────────
  { metricCode: 'tsh', sex: null, ageMin: 18, ageMax: null, rangeLow: 0.27, rangeHigh: 4.2, rangeText: '0.27~4.2 mIU/L', source: '通行口径', unit: null },
  { metricCode: 'free_t3', sex: null, ageMin: 18, ageMax: null, rangeLow: 3.1, rangeHigh: 6.8, rangeText: '3.1~6.8 pmol/L', source: '通行口径', unit: null },
  { metricCode: 'free_t4', sex: null, ageMin: 18, ageMax: null, rangeLow: 12, rangeHigh: 22, rangeText: '12~22 pmol/L', source: '通行口径', unit: null },
  { metricCode: 'total_t3', sex: null, ageMin: 18, ageMax: null, rangeLow: 1.3, rangeHigh: 3.1, rangeText: '1.3~3.1 nmol/L', source: '通行口径', unit: null },
  { metricCode: 'total_t4', sex: null, ageMin: 18, ageMax: null, rangeLow: 66, rangeHigh: 181, rangeText: '66~181 nmol/L', source: '通行口径', unit: null },
  // ── 心脏 ───────────────────────────────────────────────────────────────
  { metricCode: 'creatine_kinase', sex: 'male', ageMin: 18, ageMax: null, rangeLow: 50, rangeHigh: 310, rangeText: '50~310 U/L', source: 'WS/T 404.7-2015', unit: null },
  { metricCode: 'creatine_kinase', sex: 'female', ageMin: 18, ageMax: null, rangeLow: 40, rangeHigh: 200, rangeText: '40~200 U/L', source: 'WS/T 404.7-2015', unit: null },
  // ── 激素（分期激素只收男性行；女性分期不进判定列，见 metric_definitions text） ──
  { metricCode: 'testosterone_total', sex: 'male', ageMin: 18, ageMax: null, rangeLow: 8.64, rangeHigh: 29.0, rangeText: '8.64~29.0 nmol/L', source: '通行口径', unit: null },
  { metricCode: 'testosterone_total', sex: 'female', ageMin: 18, ageMax: null, rangeLow: 1.3, rangeHigh: 2.8, rangeText: '1.3~2.8 nmol/L', source: '通行口径', unit: null },
  { metricCode: 'prolactin', sex: 'male', ageMin: 18, ageMax: null, rangeLow: 4, rangeHigh: 15.2, rangeText: '4~15.2 ng/mL', source: '通行口径', unit: null },
  { metricCode: 'prolactin', sex: 'female', ageMin: 18, ageMax: null, rangeLow: 3.34, rangeHigh: 25, rangeText: '3.34~25 ng/mL（非孕期）', source: '通行口径', unit: null },
  { metricCode: 'estradiol', sex: 'male', ageMin: 18, ageMax: null, rangeLow: 8, rangeHigh: 36, rangeText: '8~36 pg/mL', source: '通行口径', unit: null },
  { metricCode: 'progesterone', sex: 'male', ageMin: 18, ageMax: null, rangeLow: 0.4, rangeHigh: 0.84, rangeText: '0.4~0.84 ng/mL', source: '通行口径', unit: null },
  { metricCode: 'lh', sex: 'male', ageMin: 18, ageMax: null, rangeLow: 1.7, rangeHigh: 8.6, rangeText: '1.7~8.6 mIU/mL', source: '通行口径', unit: null },
  { metricCode: 'fsh', sex: 'male', ageMin: 18, ageMax: null, rangeLow: 1.5, rangeHigh: 12.4, rangeText: '1.5~12.4 mIU/mL', source: '通行口径', unit: null },
  { metricCode: 'cortisol', sex: null, ageMin: 18, ageMax: null, rangeLow: 171, rangeHigh: 536, rangeText: '171~536 nmol/L（上午 8 时采血）', source: '通行口径', unit: null },
  // ── 维生素 ─────────────────────────────────────────────────────────────
  { metricCode: 'vitamin_d', sex: null, ageMin: 18, ageMax: null, rangeLow: 20, rangeHigh: 100, rangeText: '20~100 ng/mL（<20 缺乏 / 20~30 不足 / ≥30 充足）', source: 'WS/T 677-2020', unit: null },
  { metricCode: 'vitamin_b12', sex: null, ageMin: 18, ageMax: null, rangeLow: 200, rangeHigh: 900, rangeText: '200~900 pg/mL', source: '通行口径', unit: null },
  { metricCode: 'folate', sex: null, ageMin: 18, ageMax: null, rangeLow: 5.4, rangeHigh: 18.0, rangeText: '5.4~18.0 ng/mL（血清叶酸）', source: '通行口径', unit: null },
  // ── 生命体征 ───────────────────────────────────────────────────────────
  { metricCode: 'heart_rate', sex: null, ageMin: 18, ageMax: null, rangeLow: 60, rangeHigh: 100, rangeText: '60~100 bpm', source: '通行口径', unit: null },
  { metricCode: 'bp_systolic', sex: null, ageMin: 18, ageMax: null, rangeLow: 90, rangeHigh: 120, rangeText: '正常 <120 mmHg', source: '中国高血压防治指南', unit: null },
  { metricCode: 'bp_diastolic', sex: null, ageMin: 18, ageMax: null, rangeLow: 60, rangeHigh: 80, rangeText: '正常 <80 mmHg', source: '中国高血压防治指南', unit: null },
  { metricCode: 'temperature', sex: null, ageMin: 18, ageMax: null, rangeLow: 36, rangeHigh: 37, rangeText: '36~37 ℃', source: '通行口径', unit: null },
  { metricCode: 'respiratory_rate', sex: null, ageMin: 18, ageMax: null, rangeLow: 12, rangeHigh: 20, rangeText: '12~20 次/分', source: '通行口径', unit: null },
  { metricCode: 'spo2', sex: null, ageMin: 18, ageMax: null, rangeLow: 95, rangeHigh: 100, rangeText: '95~100%', source: '通行口径', unit: null },
  { metricCode: 'bmi', sex: null, ageMin: 18, ageMax: null, rangeLow: 18.5, rangeHigh: 23.9, rangeText: '18.5~23.9（24~27.9 超重、≥28 肥胖）', source: 'WS/T 428-2013', unit: null },
  // ── 肿瘤标志物（WS/T 645.2，单侧 ≤；系统特异取罗氏为默认） ──────────────────
  { metricCode: 'afp', sex: null, ageMin: 18, ageMax: null, rangeLow: null, rangeHigh: 7, rangeText: '≤7 ng/mL', source: 'WS/T 645.2', unit: null },
  { metricCode: 'cea', sex: null, ageMin: 18, ageMax: null, rangeLow: null, rangeHigh: 5, rangeText: '≤5 ng/mL', source: 'WS/T 645.2', unit: null },
  { metricCode: 'ca199', sex: null, ageMin: 18, ageMax: null, rangeLow: null, rangeHigh: 30, rangeText: '≤30 U/mL（罗氏/系统a）', source: 'WS/T 645.2', unit: null },
  { metricCode: 'ca153', sex: null, ageMin: 18, ageMax: null, rangeLow: null, rangeHigh: 24, rangeText: '≤24 U/mL（罗氏/系统a）', source: 'WS/T 645.2', unit: null },
  { metricCode: 'ca125', sex: 'male', ageMin: 18, ageMax: null, rangeLow: null, rangeHigh: 24, rangeText: '≤24 U/mL', source: 'WS/T 645.2', unit: null },
  { metricCode: 'ca125', sex: 'female', ageMin: 18, ageMax: 49, rangeLow: null, rangeHigh: 47, rangeText: '≤47 U/mL', source: 'WS/T 645.2', unit: null },
  { metricCode: 'ca125', sex: 'female', ageMin: 50, ageMax: null, rangeLow: null, rangeHigh: 25, rangeText: '≤25 U/mL', source: 'WS/T 645.2', unit: null },
  { metricCode: 'ca724', sex: null, ageMin: 18, ageMax: null, rangeLow: null, rangeHigh: 6.7, rangeText: '≤6.7 U/mL', source: '中国医药信息查询平台', unit: null },
  { metricCode: 'fpsa', sex: null, ageMin: 18, ageMax: null, rangeLow: null, rangeHigh: 0.8, rangeText: '≤0.8 ng/mL', source: '中国医药信息查询平台', unit: null },
  // ── 尿液 ──────────────────────────────────────────────────────────────
  { metricCode: 'urine_ph', sex: null, ageMin: 18, ageMax: null, rangeLow: 4.6, rangeHigh: 8.0, rangeText: '4.6~8.0', source: '通行口径', unit: null },
  { metricCode: 'specific_gravity', sex: null, ageMin: 18, ageMax: null, rangeLow: 1.003, rangeHigh: 1.035, rangeText: '1.003~1.035', source: '通行口径', unit: null },
  { metricCode: 'urine_glucose', sex: null, ageMin: 18, ageMax: null, rangeLow: null, rangeHigh: null, rangeText: '阴性（干化学定性）', source: '通行口径', unit: null },
  { metricCode: 'urine_protein', sex: null, ageMin: 18, ageMax: null, rangeLow: null, rangeHigh: null, rangeText: '阴性（干化学定性）', source: '通行口径', unit: null },
];
