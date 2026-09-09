export interface ReferenceRangeSeed {
  metricCode: string;
  sex: string | null;
  ageMin: number | null;
  ageMax: number | null;
  rangeLow: number | null;
  rangeHigh: number | null;
  rangeText: string | null;
  source: string;
}

export const referenceRangeSeeds: ReferenceRangeSeed[] = [
  // ── Sex-dependent ranges ──────────────────────────────────────────────────

  // Hemoglobin
  { metricCode: 'hemoglobin', sex: 'male', ageMin: 18, ageMax: null, rangeLow: 13.5, rangeHigh: 17.5, rangeText: '13.5-17.5 g/dL', source: 'ARUP' },
  { metricCode: 'hemoglobin', sex: 'female', ageMin: 18, ageMax: null, rangeLow: 12.0, rangeHigh: 16.0, rangeText: '12.0-16.0 g/dL', source: 'ARUP' },

  // Hematocrit
  { metricCode: 'hematocrit', sex: 'male', ageMin: 18, ageMax: null, rangeLow: 38.3, rangeHigh: 48.6, rangeText: '38.3-48.6%', source: 'ARUP' },
  { metricCode: 'hematocrit', sex: 'female', ageMin: 18, ageMax: null, rangeLow: 35.5, rangeHigh: 44.9, rangeText: '35.5-44.9%', source: 'ARUP' },

  // RBC
  { metricCode: 'rbc', sex: 'male', ageMin: 18, ageMax: null, rangeLow: 4.7, rangeHigh: 6.1, rangeText: '4.7-6.1 M/uL', source: 'ARUP' },
  { metricCode: 'rbc', sex: 'female', ageMin: 18, ageMax: null, rangeLow: 4.2, rangeHigh: 5.4, rangeText: '4.2-5.4 M/uL', source: 'ARUP' },

  // Creatinine
  { metricCode: 'creatinine', sex: 'male', ageMin: 18, ageMax: null, rangeLow: 0.7, rangeHigh: 1.3, rangeText: '0.7-1.3 mg/dL', source: 'ARUP' },
  { metricCode: 'creatinine', sex: 'female', ageMin: 18, ageMax: null, rangeLow: 0.6, rangeHigh: 1.1, rangeText: '0.6-1.1 mg/dL', source: 'ARUP' },

  // Iron
  { metricCode: 'iron', sex: 'male', ageMin: 18, ageMax: null, rangeLow: 65, rangeHigh: 175, rangeText: '65-175 mcg/dL', source: 'ARUP' },
  { metricCode: 'iron', sex: 'female', ageMin: 18, ageMax: null, rangeLow: 50, rangeHigh: 170, rangeText: '50-170 mcg/dL', source: 'ARUP' },

  // Ferritin
  { metricCode: 'ferritin', sex: 'male', ageMin: 18, ageMax: null, rangeLow: 12, rangeHigh: 300, rangeText: '12-300 ng/mL', source: 'ARUP' },
  { metricCode: 'ferritin', sex: 'female', ageMin: 18, ageMax: null, rangeLow: 12, rangeHigh: 150, rangeText: '12-150 ng/mL', source: 'ARUP' },

  // Testosterone
  { metricCode: 'testosterone_total', sex: 'male', ageMin: 18, ageMax: null, rangeLow: 300, rangeHigh: 1000, rangeText: '300-1000 ng/dL', source: 'ARUP' },
  { metricCode: 'testosterone_total', sex: 'female', ageMin: 18, ageMax: null, rangeLow: 15, rangeHigh: 70, rangeText: '15-70 ng/dL', source: 'ARUP' },

  // Estradiol
  { metricCode: 'estradiol', sex: 'male', ageMin: 18, ageMax: null, rangeLow: 10, rangeHigh: 40, rangeText: '10-40 pg/mL', source: 'ARUP' },
  { metricCode: 'estradiol', sex: 'female', ageMin: 18, ageMax: null, rangeLow: 15, rangeHigh: 350, rangeText: '15-350 pg/mL', source: 'ARUP' },

  // HDL Cholesterol
  { metricCode: 'hdl_cholesterol', sex: 'male', ageMin: 18, ageMax: null, rangeLow: 40, rangeHigh: 60, rangeText: '> 40 mg/dL', source: 'ARUP' },
  { metricCode: 'hdl_cholesterol', sex: 'female', ageMin: 18, ageMax: null, rangeLow: 50, rangeHigh: 60, rangeText: '> 50 mg/dL', source: 'ARUP' },

  // ESR
  { metricCode: 'esr', sex: 'male', ageMin: 18, ageMax: null, rangeLow: 0, rangeHigh: 15, rangeText: '0-15 mm/hr', source: 'ARUP' },
  { metricCode: 'esr', sex: 'female', ageMin: 18, ageMax: null, rangeLow: 0, rangeHigh: 20, rangeText: '0-20 mm/hr', source: 'ARUP' },

  // Uric Acid
  { metricCode: 'uric_acid', sex: 'male', ageMin: 18, ageMax: null, rangeLow: 3.5, rangeHigh: 7.2, rangeText: '3.5-7.2 mg/dL', source: 'ARUP' },
  { metricCode: 'uric_acid', sex: 'female', ageMin: 18, ageMax: null, rangeLow: 2.6, rangeHigh: 6.0, rangeText: '2.6-6.0 mg/dL', source: 'ARUP' },

  // DHEA-S (age-banded + sex-dependent)
  { metricCode: 'dhea_s', sex: 'male', ageMin: 18, ageMax: 39, rangeLow: 280, rangeHigh: 640, rangeText: '280-640 mcg/dL', source: 'ARUP' },
  { metricCode: 'dhea_s', sex: 'male', ageMin: 40, ageMax: null, rangeLow: 120, rangeHigh: 520, rangeText: '120-520 mcg/dL', source: 'ARUP' },
  { metricCode: 'dhea_s', sex: 'female', ageMin: 18, ageMax: 39, rangeLow: 65, rangeHigh: 380, rangeText: '65-380 mcg/dL', source: 'ARUP' },
  { metricCode: 'dhea_s', sex: 'female', ageMin: 40, ageMax: null, rangeLow: 35, rangeHigh: 260, rangeText: '35-260 mcg/dL', source: 'ARUP' },

  // ── Non-sex-dependent ranges ──────────────────────────────────────────────

  { metricCode: 'glucose', sex: null, ageMin: 18, ageMax: null, rangeLow: 70, rangeHigh: 100, rangeText: '70-100 mg/dL (fasting)', source: 'ARUP' },
  { metricCode: 'bun', sex: null, ageMin: 18, ageMax: null, rangeLow: 7, rangeHigh: 20, rangeText: '7-20 mg/dL', source: 'ARUP' },
  { metricCode: 'sodium', sex: null, ageMin: 18, ageMax: null, rangeLow: 136, rangeHigh: 145, rangeText: '136-145 mEq/L', source: 'ARUP' },
  { metricCode: 'potassium', sex: null, ageMin: 18, ageMax: null, rangeLow: 3.5, rangeHigh: 5.0, rangeText: '3.5-5.0 mEq/L', source: 'ARUP' },
  { metricCode: 'chloride', sex: null, ageMin: 18, ageMax: null, rangeLow: 98, rangeHigh: 106, rangeText: '98-106 mEq/L', source: 'ARUP' },
  { metricCode: 'co2', sex: null, ageMin: 18, ageMax: null, rangeLow: 23, rangeHigh: 29, rangeText: '23-29 mEq/L', source: 'ARUP' },
  { metricCode: 'calcium', sex: null, ageMin: 18, ageMax: null, rangeLow: 8.5, rangeHigh: 10.5, rangeText: '8.5-10.5 mg/dL', source: 'ARUP' },
  { metricCode: 'total_protein', sex: null, ageMin: 18, ageMax: null, rangeLow: 6.0, rangeHigh: 8.3, rangeText: '6.0-8.3 g/dL', source: 'ARUP' },
  { metricCode: 'albumin', sex: null, ageMin: 18, ageMax: null, rangeLow: 3.5, rangeHigh: 5.5, rangeText: '3.5-5.5 g/dL', source: 'ARUP' },
  { metricCode: 'bilirubin_total', sex: null, ageMin: 18, ageMax: null, rangeLow: 0.1, rangeHigh: 1.2, rangeText: '0.1-1.2 mg/dL', source: 'ARUP' },
  { metricCode: 'alp', sex: null, ageMin: 18, ageMax: null, rangeLow: 44, rangeHigh: 147, rangeText: '44-147 U/L', source: 'ARUP' },
  { metricCode: 'alt', sex: null, ageMin: 18, ageMax: null, rangeLow: 7, rangeHigh: 56, rangeText: '7-56 U/L', source: 'ARUP' },
  { metricCode: 'ast', sex: null, ageMin: 18, ageMax: null, rangeLow: 10, rangeHigh: 40, rangeText: '10-40 U/L', source: 'ARUP' },
  { metricCode: 'wbc', sex: null, ageMin: 18, ageMax: null, rangeLow: 4.5, rangeHigh: 11.0, rangeText: '4.5-11.0 K/uL', source: 'ARUP' },
  { metricCode: 'mcv', sex: null, ageMin: 18, ageMax: null, rangeLow: 80, rangeHigh: 100, rangeText: '80-100 fL', source: 'ARUP' },
  { metricCode: 'mch', sex: null, ageMin: 18, ageMax: null, rangeLow: 27, rangeHigh: 33, rangeText: '27-33 pg', source: 'ARUP' },
  { metricCode: 'mchc', sex: null, ageMin: 18, ageMax: null, rangeLow: 32, rangeHigh: 36, rangeText: '32-36 g/dL', source: 'ARUP' },
  { metricCode: 'rdw', sex: null, ageMin: 18, ageMax: null, rangeLow: 11.5, rangeHigh: 14.5, rangeText: '11.5-14.5%', source: 'ARUP' },
  { metricCode: 'platelets', sex: null, ageMin: 18, ageMax: null, rangeLow: 150, rangeHigh: 400, rangeText: '150-400 K/uL', source: 'ARUP' },
  { metricCode: 'mpv', sex: null, ageMin: 18, ageMax: null, rangeLow: 7.5, rangeHigh: 11.5, rangeText: '7.5-11.5 fL', source: 'ARUP' },
  { metricCode: 'cholesterol_total', sex: null, ageMin: 18, ageMax: null, rangeLow: 0, rangeHigh: 200, rangeText: '< 200 mg/dL (desirable)', source: 'ARUP' },
  { metricCode: 'ldl_cholesterol', sex: null, ageMin: 18, ageMax: null, rangeLow: 0, rangeHigh: 100, rangeText: '< 100 mg/dL (optimal)', source: 'ARUP' },
  { metricCode: 'triglycerides', sex: null, ageMin: 18, ageMax: null, rangeLow: 0, rangeHigh: 150, rangeText: '< 150 mg/dL (normal)', source: 'ARUP' },
  { metricCode: 'vldl_cholesterol', sex: null, ageMin: 18, ageMax: null, rangeLow: 5, rangeHigh: 40, rangeText: '5-40 mg/dL', source: 'ARUP' },
  { metricCode: 'tsh', sex: null, ageMin: 18, ageMax: null, rangeLow: 0.4, rangeHigh: 4.0, rangeText: '0.4-4.0 mIU/L', source: 'ARUP' },
  { metricCode: 'free_t4', sex: null, ageMin: 18, ageMax: null, rangeLow: 0.8, rangeHigh: 1.8, rangeText: '0.8-1.8 ng/dL', source: 'ARUP' },
  { metricCode: 'free_t3', sex: null, ageMin: 18, ageMax: null, rangeLow: 2.3, rangeHigh: 4.2, rangeText: '2.3-4.2 pg/mL', source: 'ARUP' },
  { metricCode: 'total_t3', sex: null, ageMin: 18, ageMax: null, rangeLow: 80, rangeHigh: 200, rangeText: '80-200 ng/dL', source: 'ARUP' },
  { metricCode: 'total_t4', sex: null, ageMin: 18, ageMax: null, rangeLow: 4.5, rangeHigh: 12.0, rangeText: '4.5-12.0 mcg/dL', source: 'ARUP' },
  { metricCode: 'tibc', sex: null, ageMin: 18, ageMax: null, rangeLow: 250, rangeHigh: 370, rangeText: '250-370 mcg/dL', source: 'ARUP' },
  { metricCode: 'transferrin_saturation', sex: null, ageMin: 18, ageMax: null, rangeLow: 20, rangeHigh: 50, rangeText: '20-50%', source: 'ARUP' },
  { metricCode: 'vitamin_d', sex: null, ageMin: 18, ageMax: null, rangeLow: 30, rangeHigh: 100, rangeText: '30-100 ng/mL (sufficient)', source: 'ARUP' },
  { metricCode: 'vitamin_b12', sex: null, ageMin: 18, ageMax: null, rangeLow: 200, rangeHigh: 900, rangeText: '200-900 pg/mL', source: 'ARUP' },
  { metricCode: 'folate', sex: null, ageMin: 18, ageMax: null, rangeLow: 2.7, rangeHigh: 17.0, rangeText: '2.7-17.0 ng/mL', source: 'ARUP' },
  { metricCode: 'direct_bilirubin', sex: null, ageMin: 18, ageMax: null, rangeLow: 0.0, rangeHigh: 0.3, rangeText: '0.0-0.3 mg/dL', source: 'ARUP' },
  { metricCode: 'ggt', sex: null, ageMin: 18, ageMax: null, rangeLow: 9, rangeHigh: 48, rangeText: '9-48 U/L', source: 'ARUP' },
  { metricCode: 'egfr', sex: null, ageMin: 18, ageMax: null, rangeLow: 60, rangeHigh: null, rangeText: '> 60 mL/min/1.73m2', source: 'ARUP' },
  { metricCode: 'bun_creatinine_ratio', sex: null, ageMin: 18, ageMax: null, rangeLow: 10, rangeHigh: 20, rangeText: '10-20', source: 'ARUP' },
  { metricCode: 'progesterone', sex: null, ageMin: 18, ageMax: null, rangeLow: 0.1, rangeHigh: 25, rangeText: 'Varies by cycle phase', source: 'ARUP' },
  { metricCode: 'lh', sex: null, ageMin: 18, ageMax: null, rangeLow: 1.5, rangeHigh: 9.3, rangeText: '1.5-9.3 mIU/mL', source: 'ARUP' },
  { metricCode: 'fsh', sex: null, ageMin: 18, ageMax: null, rangeLow: 1.5, rangeHigh: 12.4, rangeText: '1.5-12.4 mIU/mL', source: 'ARUP' },
  { metricCode: 'cortisol', sex: null, ageMin: 18, ageMax: null, rangeLow: 6.2, rangeHigh: 19.4, rangeText: '6.2-19.4 mcg/dL (AM)', source: 'ARUP' },
  { metricCode: 'crp', sex: null, ageMin: 18, ageMax: null, rangeLow: 0, rangeHigh: 10, rangeText: '< 10 mg/L', source: 'ARUP' },
  { metricCode: 'hs_crp', sex: null, ageMin: 18, ageMax: null, rangeLow: 0, rangeHigh: 3.0, rangeText: '< 3.0 mg/L', source: 'ARUP' },
  { metricCode: 'hemoglobin_a1c', sex: null, ageMin: 18, ageMax: null, rangeLow: 4.0, rangeHigh: 5.6, rangeText: '< 5.7% (normal)', source: 'ARUP' },
  { metricCode: 'insulin', sex: null, ageMin: 18, ageMax: null, rangeLow: 2.6, rangeHigh: 24.9, rangeText: '2.6-24.9 uIU/mL (fasting)', source: 'ARUP' },
  { metricCode: 'c_peptide', sex: null, ageMin: 18, ageMax: null, rangeLow: 1.1, rangeHigh: 4.4, rangeText: '1.1-4.4 ng/mL', source: 'ARUP' },
  { metricCode: 'bnp', sex: null, ageMin: 18, ageMax: null, rangeLow: 0, rangeHigh: 100, rangeText: '< 100 pg/mL', source: 'ARUP' },
  { metricCode: 'troponin_i', sex: null, ageMin: 18, ageMax: null, rangeLow: 0, rangeHigh: 0.04, rangeText: '< 0.04 ng/mL', source: 'ARUP' },
  { metricCode: 'ck_mb', sex: null, ageMin: 18, ageMax: null, rangeLow: 0, rangeHigh: 5, rangeText: '< 5 ng/mL', source: 'ARUP' },
  { metricCode: 'urine_ph', sex: null, ageMin: 18, ageMax: null, rangeLow: 4.5, rangeHigh: 8.0, rangeText: '4.5-8.0', source: 'ARUP' },
  { metricCode: 'specific_gravity', sex: null, ageMin: 18, ageMax: null, rangeLow: 1.005, rangeHigh: 1.030, rangeText: '1.005-1.030', source: 'ARUP' },
  { metricCode: 'urine_protein', sex: null, ageMin: 18, ageMax: null, rangeLow: 0, rangeHigh: 14, rangeText: 'Negative', source: 'ARUP' },
  { metricCode: 'urine_glucose', sex: null, ageMin: 18, ageMax: null, rangeLow: 0, rangeHigh: 15, rangeText: 'Negative', source: 'ARUP' },
  { metricCode: 'heart_rate', sex: null, ageMin: 18, ageMax: null, rangeLow: 60, rangeHigh: 100, rangeText: '60-100 bpm', source: 'ARUP' },
  { metricCode: 'bp_systolic', sex: null, ageMin: 18, ageMax: null, rangeLow: 90, rangeHigh: 120, rangeText: '< 120 mmHg (normal)', source: 'ARUP' },
  { metricCode: 'bp_diastolic', sex: null, ageMin: 18, ageMax: null, rangeLow: 60, rangeHigh: 80, rangeText: '< 80 mmHg (normal)', source: 'ARUP' },
  { metricCode: 'temperature', sex: null, ageMin: 18, ageMax: null, rangeLow: 97.8, rangeHigh: 99.1, rangeText: '97.8-99.1 F', source: 'ARUP' },
  { metricCode: 'respiratory_rate', sex: null, ageMin: 18, ageMax: null, rangeLow: 12, rangeHigh: 20, rangeText: '12-20 breaths/min', source: 'ARUP' },
  { metricCode: 'spo2', sex: null, ageMin: 18, ageMax: null, rangeLow: 95, rangeHigh: 100, rangeText: '95-100%', source: 'ARUP' },
  { metricCode: 'bmi', sex: null, ageMin: 18, ageMax: null, rangeLow: 18.5, rangeHigh: 24.9, rangeText: '18.5-24.9 kg/m2 (normal)', source: 'ARUP' },
];
