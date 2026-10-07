/**
 * 单位规范化 + 参考区间对应性门禁（spec 13 对照表 §四 / §五 / §6.1）
 *
 * 纯函数、无副作用，供 packages/ingestion（normalizer）与 services/ingestion-worker 共用。
 *
 * 设计边界（务必先读）：
 *  1. 本模块只做「写法归一」与「精确进制记号等价」（K/µL≡10^9/L、M/µL≡10^12/L，数值不变），
 *     **不做任何物理量换算**（不把 mg/dL 的数字改成 mmol/L）——沿用项目「不做强制单位换算」原则。
 *  2. 门禁只作用于 fallback（字典/人口学区间）；报告原文区间（优先级 1）永不介入。
 *  3. mEq/L 不参与全局归一：Na/K/Cl/Mg 为单价离子数值≡mmol/L，但 Ca 为二价（1 mmol/L = 2 mEq/L），
 *     一律改写会引入 2 倍误差，故保持原样、不做等价。
 */

/** 把单位拼写归一到规范形；无法识别时返回去空白后的原文；空/纯空白返回 null */
export function canonicalUnit(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let u = raw.trim();
  if (!u) return null;

  // 1) 微符号统一为 µ (U+00B5)：U+03BC(Greek mu) / U+00B5(micro sign) / 误用字符
  u = u.replace(/[\u03BC\u00B5\uFB00]/g, '\u00B5');
  // 全角斜杠 → 半角
  u = u.replace(/\uFF0F/g, '/');

  // 2) 精确进制记号等价（数值完全不变，仅计数写法不同）
  //    1 K/µL = 1000/µL = 10^3 × 10^6/L = 10^9/L
  //    1 M/µL = 10^6/µL = 10^6 × 10^6/L = 10^12/L
  u = u.replace(/^K\s*\/\s*[uµ]L$/i, '10^9/L');
  u = u.replace(/^M\s*\/\s*[uµ]L$/i, '10^12/L');

  // 3) 分母/分子大小写归一（R5：泛化到任意分子，避免 pg/ml vs pg/mL、ml/min vs mL/min 被误判为不同单位）
  u = u.replace(/^u\s*mol\s*\/\s*l$/i, '\u00B5mol/L'); // umol/l、umol/L
  u = u.replace(/\u00B5mol\s*\/\s*l$/i, '\u00B5mol/L'); // µmol/l
  u = u.replace(/\/\s*l$/i, '/L'); // mg/l → mg/L、mmol/l → mmol/L
  u = u.replace(/\/\s*ml$/i, '/mL'); // pg/ml → pg/mL、ng/ml → ng/mL
  u = u.replace(/\/\s*dl$/i, '/dL'); // mg/dl → mg/dL、g/dl → g/dL
  u = u.replace(/\/\s*ul$/i, '/\u00B5L'); // /ul → /µL
  u = u.replace(/^ml\s*\//i, 'mL/'); // ml/min/1.73m2 → mL/min/1.73m2
  u = u.replace(/^u\s*\/\s*l$/i, 'U/L'); // u/l → U/L
  u = u.replace(/^u\s*\/\s*ml$/i, 'U/mL');

  // 4) 去内部空白
  u = u.replace(/\s+/g, '');

  return u || null;
}

export interface GateResult {
  ok: boolean;
  reason?: string;
}

/**
 * 逐指标「单位等价类」（R6）—— 只有**显式声明过**的指标才允许跨拼写等价，
 * 未声明的仍走严格相等（安全默认）。
 *
 * 检验医学依据：
 *  - **单价离子** K⁺ / Na⁺ / Cl⁻ / HCO₃⁻：1 mEq/L ≡ 1 mmol/L（数值完全相等，仅表达方式不同）
 *  - **二价离子 Ca²⁺ / Mg²⁺ 明确不可等价**：1 mmol/L = 2 mEq/L，
 *    若一并等价会引入 2 倍误差 → 故意不列入。
 *
 * 历史教训：本轮首次实现时一刀切禁止 mEq/L 与 mmol/L 等价，导致
 * potassium / sodium / chloride / co2 的 fallback 区间被**误杀**（实测 4 条）。
 */
const UNIT_EQUIVALENCE: Record<string, string[][]> = {
  potassium: [['mEq/L', 'mmol/L']],
  sodium: [['mEq/L', 'mmol/L']],
  chloride: [['mEq/L', 'mmol/L']],
  co2: [['mEq/L', 'mmol/L']],
};

function isEquivalentUnit(metricId: string, a: string, b: string): boolean {
  const pairs = UNIT_EQUIVALENCE[metricId];
  if (!pairs) return false;
  return pairs.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
}

/**
 * 单位一致性门禁（spec 13 §五）。
 *
 * 逻辑：fallback 区间的数值是在**字典声明的单位**下写的（metric_definitions.unit）。
 * 只有当观测单位与字典单位一致（或属声明的等价类）时，那串数字才可能对得上；
 * 单位不一致 = 数字量级必然错位（如 creatinine 字典 0.6~1.2 mg/dL 贴到 146 µmol/L 的值上，差 88.4 倍）。
 *
 * @param metricId 指标 id —— 用于查逐指标等价类（R6）。不传则只做严格相等。
 */
export function checkUnitConsistency(
  obsUnit: string | null | undefined,
  dictUnit: string | null | undefined,
  metricId?: string,
): GateResult {
  const u = canonicalUnit(obsUnit);
  const d = canonicalUnit(dictUnit);

  // R7：两边都无单位 →「不一致」这个判据不成立，不做判定（避免无谓拦截）
  if (!u && !d) return { ok: true };

  if (!u) {
    return { ok: false, reason: '观测单位缺失，无法确认区间对应性' };
  }
  if (!d) {
    return { ok: false, reason: `字典未声明单位，无法确认 fallback 区间（观测单位 ${u}）的对应性` };
  }
  if (u === d) return { ok: true };

  // R6：逐指标等价类（仅声明过的指标，如单价离子的 mEq/L ≡ mmol/L）
  if (metricId && isEquivalentUnit(metricId, u, d)) return { ok: true };

  return { ok: false, reason: `观测单位 ${u} 与字典区间单位 ${d} 不一致，fallback 区间数值量级不可用` };
}

/**
 * §6.1 数值量级带（正交于单位门禁）。
 *
 * 数据来源：`observations` 中 **reference_range_text 非空**（即报告原文区间，优先级 1 产物）的
 * 真实样本，按 (metric_code, 单位) 归并取 [min(low), max(high)]。仅收录
 * 「该行的 metric_code 就是该指标的真实归属」的样本——已知挂错行（如 platelets@% 实为 PDW）
 * 一律不纳入，避免用污染数据造带。
 *
 * 用途：① fallback 区间的第二道网（单位相同但量级仍旧不对时拦下）；
 *       ② ⑤ 重挂正确性的自动校验器（重挂后 (metric,unit) 越出带 → 说明重挂有误）。
 *
 * 未收录的 (metric,unit) → 不做量级判定（返回 ok），避免过度拦截。
 */
export interface MagnitudeBand {
  low: number;
  high: number;
  /** 采样说明（可复核） */
  note: string;
}

export const MAGNITUDE_BANDS: Record<string, MagnitudeBand> = {
  // key = `${metricId}@${canonicalUnit}`
  'alp@U/L': { low: 50, high: 135, note: '报告原文 50-135' },
  'basophils_pct@%': { low: 0, high: 1, note: '报告原文 0-1' },
  'bun@mmol/L': { low: 1.7, high: 8.3, note: '报告原文 1.7-8.3（尿素 mmol/L）' },
  'calcium@mmol/L': { low: 2.08, high: 2.6, note: '报告原文 2.08-2.6' },
  'chloride@mmol/L': { low: 96, high: 110, note: '报告原文 96-110' },
  'co2@mmol/L': { low: 22, high: 29, note: '报告原文 22-29' },
  'creatinine@µmol/L': { low: 41, high: 15000, note: '报告原文 血 41-73 / 尿 7500-15000' },
  'creatinine@mg/g': { low: 0, high: 30, note: '报告原文 0-30（UACR mg/g）' },
  'cystatin_c@mg/L': { low: 0.54, high: 1.15, note: '报告原文 0.54-1.15' },
  'direct_bilirubin@µmol/L': { low: 1.7, high: 6.8, note: '报告原文 1.7-6.8' },
  'egfr@ml/min/1.73m2': { low: 60, high: 200, note: '报告原文 >90（下限放至 60 容 CKD 分期）' },
  'eosinophils_pct@%': { low: 0.4, high: 8, note: '报告原文 0.4-8' },
  'ggt@U/L': { low: 7, high: 45, note: '报告原文 7-45' },
  'globulin@g/L': { low: 20, high: 40, note: '报告原文 20-40' },
  'glucose@mmol/L': { low: 3.9, high: 6.1, note: '报告原文 空腹 3.9-6.1' },
  'hemoglobin@g/L': { low: 115, high: 150, note: '报告原文 115-150（排除挂错的 316-354=MCHC）' },
  'hs_crp@mg/L': { low: 0, high: 10, note: '报告原文 0-10' },
  'lymphocytes_pct@%': { low: 17, high: 50, note: '报告原文 17-50' },
  'magnesium@mmol/L': { low: 0.75, high: 1.02, note: '报告原文 0.75-1.02' },
  'malb@mg/L': { low: 0, high: 30, note: '报告原文 0-20 / 0-30' },
  'monocytes_pct@%': { low: 3, high: 10, note: '报告原文 3-10' },
  'mpv@fL': { low: 6.5, high: 12, note: '报告原文 6.5-12' },
  'neutrophils_pct@%': { low: 40, high: 75, note: '报告原文 40-75' },
  'platelets@10^9/L': { low: 30, high: 400, note: '报告原文 125-350（放宽至 30-400）' },
  'potassium@mmol/L': { low: 3.5, high: 5.5, note: '报告原文 3.5-5.5' },
  'rbc@10^12/L': { low: 3.8, high: 5.1, note: '报告原文 3.8-5.1' },
  'sodium@mmol/L': { low: 135, high: 147, note: '报告原文 135-147' },
  'specific_gravity@': { low: 1.0, high: 1.04, note: '报告原文 1.003-1.035' },
  'total_protein@g/L': { low: 60, high: 85, note: '报告原文 60-85' },
  'uric_acid@mg/dL': { low: 4.6, high: 8, note: '报告原文 4.6-8' },
  'uric_acid@µmol/L': { low: 140, high: 380, note: '报告原文 140-380' },
  'wbc@10^9/L': { low: 3.5, high: 9.5, note: '报告原文 3.5-9.5' },
};

/**
 * 量级带校验：fallback 区间的**中点**必须落在带内。
 *
 * 为什么用中点而不是「有重叠」：`bun 7~20`（mg/dL 量级）与 mmol/L 带 `1.7~8.3`
 * 在 `7~8.3` 处**有重叠**，仅查重叠会漏。中点判定严格强于重叠判定，且对
 * 「区间偏宽但量级正确」的 fallback 仍然放行（如带 [3.9,6.1] 遇 3.3~7.0，中点 5.15 在带内）。
 *
 * 无带可查 / 区间为空 → 不做判定（ok），避免过度拦截。
 */
export function checkMagnitudeBand(
  metricId: string,
  unit: string | null | undefined,
  low: number | null,
  high: number | null,
): GateResult {
  if (low === null && high === null) return { ok: true };
  const cu = canonicalUnit(unit);
  const band = MAGNITUDE_BANDS[`${metricId}@${cu ?? ''}`];
  if (!band) return { ok: true };

  const lo = low ?? band.low;
  const hi = high ?? band.high;
  const mid = (lo + hi) / 2;
  if (mid < band.low || mid > band.high) {
    return {
      ok: false,
      reason: `区间 ${lo}~${hi}（中点 ${mid}）落在 ${metricId}@${cu} 量级带 ${band.low}~${band.high} 之外`,
    };
  }
  return { ok: true };
}
