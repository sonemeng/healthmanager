import type { RawExtraction, NormalizedObservation, FlaggedExtraction, NormalizationResult } from './types';
import { CONFIDENCE_THRESHOLD } from '@openvitals/common';
import { checkUnitConsistency, checkMagnitudeBand, canonicalUnit } from './units';

export interface DemographicRange {
  sex: string | null;
  ageMin: number | null;
  ageMax: number | null;
  rangeLow: number | null;
  rangeHigh: number | null;
}

export interface UserDemographics {
  sex: string | null;
  ageInYears: number | null;
}

export interface MetricDefinition {
  id: string;
  name: string;
  category: string;
  unit: string | null;
  aliases: string[];
  referenceRangeLow: number | null;
  referenceRangeHigh: number | null;
  demographicRanges?: DemographicRange[];
}

export interface UnitConversion {
  fromUnit: string;
  toUnit: string;
  metricCode: string | null;
  multiplier: number;
  offset: number;
}

/**
 * 匹配用清洗：去中英文括号及内容、空白、星号、间隔号、连字符，转小写。
 * "糖链抗原125(陕HR)" → "糖链抗原125"；"糖链抗原125（CA125）" → "糖链抗原125"
 * "C-反应蛋白" → "c反应蛋白"；"γ-谷氨酰基转移酶" → "γ谷氨酰基转移酶"
 */
export function cleanForMatch(s: string): string {
  return s.toLowerCase().trim()
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/[\s*＊·・]/g, '')
    .replace(/[-－—–]/g, '');
}

function containsBidirectional(a: string, b: string): boolean {
  if (a.length < 2 || b.length < 2) return false; // 防短别名误伤
  return a.includes(b) || b.includes(a);
}

/**
 * L4 包含层的排除规则：命中即否决该指标在这一层的候选资格
 * （防止长名指标被短名指标吞掉）。**只在 L4 生效**——精确匹配（L1–L3）不受其影响。
 */
const L4_EXCLUSIONS: Record<string, { contains?: string[]; endsWith?: string[] }> = {
  creatinine: { contains: ['尿肌酐', '肌酐比', '白蛋白肌酐', 'acr'] },
  cholesterol_total: { contains: ['胆红素', '胆汁酸'] },
  malb: { contains: ['血清白蛋白'] },
  uric_acid: { contains: ['尿酸碱度', '酸碱度'] },
  hemoglobin: { contains: ['平均血红蛋白'] },
  platelets: { contains: ['分布宽度', '压积', '比积', '平均', '大血小板', '大型血小板'] },
  wbc: { contains: ['酯酶'] },
  rdw: { endsWith: ['sd'] },
};

function isExcludedAtL4(metricId: string, cleaned: string): boolean {
  const rule = L4_EXCLUSIONS[metricId];
  if (!rule) return false;
  if (rule.contains?.some((kw) => cleaned.includes(cleanForMatch(kw)))) return true;
  if (rule.endsWith?.some((suffix) => cleaned.endsWith(cleanForMatch(suffix)))) return true;
  return false;
}

const L1_EXACT_ID = 1000;
const L2_EXACT_NAME = 900;
const L3_EXACT_ALIAS = 800;

/**
 * 按评分制计算单个字典条目的候选分（spec 13 §三）：
 *   L1 1000  = analyte(trim+lower) 精确等于指标 id
 *   L2  900  = 清洗后 name 精确相等
 *   L3  800  = 清洗后 alias 精确相等
 *   L4 400 + floor(200 × minLen/maxLen) = 清洗后双向包含（按参与匹配的长度比计分）
 *   0        = 无命中
 */
function scoreDefinition(
  def: MetricDefinition,
  lowerAnalyte: string,
  cleaned: string
): number {
  if (def.id === lowerAnalyte) return L1_EXACT_ID;
  if (cleanForMatch(def.name) === cleaned) return L2_EXACT_NAME;
  if (def.aliases.some((a) => cleanForMatch(a) === cleaned)) return L3_EXACT_ALIAS;

  if (isExcludedAtL4(def.id, cleaned)) return 0;

  let best = 0;
  const candidates = [cleanForMatch(def.name), ...def.aliases.map(cleanForMatch)];
  for (const c of candidates) {
    if (!containsBidirectional(c, cleaned)) continue;
    const minLen = Math.min(c.length, cleaned.length);
    const maxLen = Math.max(c.length, cleaned.length);
    const score = 400 + Math.floor((200 * minLen) / maxLen);
    if (score > best) best = score;
  }
  return best;
}

/**
 * 评分制匹配（替代「逐层 find 首个命中」）：对全部字典条目计分取最高，
 * **平分按 metric id 字典序 tie-break**（保证确定性，不依赖 DB 无 ORDER BY 的返回顺序）。
 * 无命中返回 null → unmatched flagged（交由自学习/人工复核）。
 */
export function matchMetric(
  analyte: string,
  metricDefinitions: MetricDefinition[]
): MetricDefinition | null {
  const lowerAnalyte = analyte.toLowerCase().trim();
  const cleaned = cleanForMatch(analyte);
  if (cleaned.length === 0) return null;

  let best: MetricDefinition | null = null;
  let bestScore = 0;

  for (const def of metricDefinitions) {
    const score = scoreDefinition(def, lowerAnalyte, cleaned);
    if (score <= 0) continue;
    if (score > bestScore || (score === bestScore && (best === null || def.id < best.id))) {
      best = def;
      bestScore = score;
    }
  }

  return best;
}

/**
 * Find the best matching demographic range for a given user.
 * Scoring: sex-specific > any-sex, narrower age band > wider.
 */
function findBestDemographicRange(
  ranges: DemographicRange[],
  demographics: UserDemographics
): DemographicRange | null {
  let bestRange: DemographicRange | null = null;
  let bestScore = -1;

  for (const range of ranges) {
    // Check age bounds
    if (demographics.ageInYears !== null) {
      if (range.ageMin !== null && demographics.ageInYears < range.ageMin) continue;
      if (range.ageMax !== null && demographics.ageInYears > range.ageMax) continue;
    }

    // Check sex match
    if (range.sex !== null && demographics.sex !== null && range.sex !== demographics.sex) continue;

    // Score: sex-specific = +2, narrow age band = +1
    let score = 0;
    if (range.sex !== null && range.sex === demographics.sex) score += 2;
    if (range.ageMin !== null || range.ageMax !== null) score += 1;
    // Narrower band (both bounds set) gets extra point
    if (range.ageMin !== null && range.ageMax !== null) score += 1;

    if (score > bestScore) {
      bestScore = score;
      bestRange = range;
    }
  }

  return bestRange;
}

export interface ResolvedRange {
  low: number | null;
  high: number | null;
  /** 是否被区间对应性门禁拦下（仅 fallback 路径可能为 true） */
  gated?: boolean;
  gateReason?: string;
}

/**
 * Resolve reference range with priority:
 * 1. Per-observation range from the extraction —— 报告原文区间，**永不门禁**
 * 2. Demographic-matched range from reference_ranges table ┐
 * 3. Metric definition fallback                            ┘ 走区间对应性门禁（spec 13 §五）
 *
 * 门禁只作用于 2/3：字典/人口学区间的数值是在 `metric.unit` 下写的，
 * 若观测单位与之不一致（或数值量级带对不上），那串数字必然错位，
 * 宁可留空也不给出错误的「偏高/偏低」。
 */
export function resolveReferenceRange(
  extraction: RawExtraction,
  metric: MetricDefinition,
  demographics?: UserDemographics | null,
): ResolvedRange {
  // Priority 1: per-observation range（报告原文优先，不做任何换算与门禁）
  if (extraction.referenceRangeLow !== null || extraction.referenceRangeHigh !== null) {
    return {
      low: extraction.referenceRangeLow,
      high: extraction.referenceRangeHigh,
    };
  }

  // Priority 2: demographic match
  let fallback: { low: number | null; high: number | null } | null = null;
  if (demographics && metric.demographicRanges && metric.demographicRanges.length > 0) {
    const match = findBestDemographicRange(metric.demographicRanges, demographics);
    if (match) fallback = { low: match.rangeLow, high: match.rangeHigh };
  }

  // Priority 3: metric definition fallback
  if (!fallback) {
    fallback = { low: metric.referenceRangeLow, high: metric.referenceRangeHigh };
  }

  // 无区间可用 → 不存在「错配」问题，无需门禁
  if (fallback.low === null && fallback.high === null) return fallback;

  // ── 区间对应性门禁 ──────────────────────────────────────────────────────────
  // (1) 单位一致性：fallback 数值是在字典单位下写的，观测单位必须一致
  const unitGate = checkUnitConsistency(extraction.unit, metric.unit, metric.id);
  if (!unitGate.ok) {
    return { low: null, high: null, gated: true, gateReason: unitGate.reason };
  }
  // (2) §6.1 数值量级带：单位相同但量级仍旧不对（正交第二道网）
  const bandGate = checkMagnitudeBand(metric.id, extraction.unit, fallback.low, fallback.high);
  if (!bandGate.ok) {
    return { low: null, high: null, gated: true, gateReason: bandGate.reason };
  }

  return fallback;
}

export function normalizeExtractions(
  extractions: RawExtraction[],
  metricDefinitions: MetricDefinition[],
  unitConversions: UnitConversion[],
  baseConfidence: number = 0.85,
  demographics?: UserDemographics | null,
): NormalizationResult {
  const normalized: NormalizedObservation[] = [];
  const flagged: FlaggedExtraction[] = [];

  for (const extraction of extractions) {
    const metric = matchMetric(extraction.analyte, metricDefinitions);

    if (!metric) {
      flagged.push({
        extraction,
        reason: 'unmatched_metric',
        details: `No metric definition found for analyte: ${extraction.analyte}`,
      });
      continue;
    }

    // 化验单原文优先：报告单写的数值与单位照抄，不做强制单位换算。
    // 强制换算会造成两类错误：
    // 1) 换算系数按血清指标制定，尿肌酐等体液浓度套用后数值失真（如尿肌酐 2831 umol/L → 32 mg/dL）
    // 2) 值被换算而参考区间照抄原文，单位错位导致异常判断不可靠
    // 指标字典单位仅作为报告单缺单位时的显示兜底。
    let finalValue = extraction.value;
    let finalUnit = extraction.unit ?? metric.unit ?? '';

    // Determine abnormality using demographic-aware ranges
    const range = resolveReferenceRange(extraction, metric, demographics);
    const { low: refLow, high: refHigh } = range;
    // 门禁拦下时 refLow/refHigh 为 null → isAbnormal 退回报告自身的 ↑/↓ 标记或 null
    // （宁可「未知方向」，也不给出由错位区间算出的错误方向）
    const isAbnormal = extraction.isAbnormal ??
      (finalValue !== null && refLow !== null && refHigh !== null
        ? finalValue < refLow || finalValue > refHigh
        : null);

    if (range.gated) {
      flagged.push({
        extraction,
        reason: 'range_unit_mismatch',
        details: range.gateReason ?? 'fallback 区间与观测单位不对应，已置空',
      });
    }

    const obs: NormalizedObservation = {
      metricCode: metric.id,
      category: metric.category as any,
      valueNumeric: finalValue,
      valueText: extraction.valueText,
      unit: finalUnit,
      referenceRangeLow: refLow,
      referenceRangeHigh: refHigh,
      referenceRangeText: extraction.referenceRangeText,
      isAbnormal,
      // 无日期行不再丢弃：用当前时刻占位并标记 fallback，落库后 UI 显示「日期未知」
      observedAt: extraction.observedAt ? new Date(extraction.observedAt) : new Date(),
      observedAtIsFallback: !extraction.observedAt,
      confidenceScore: baseConfidence,
      analyte: extraction.analyte,
      // 溯源属性：括号剥离内容 + 互认标识（不参与匹配，落 metadata_json）
      analyteNote: extraction.analyteNote,
      interopMark: extraction.interopMark,
      // 门禁留痕（R2）：被拦下时记录原因，落 metadata_json 供事后审计
      gateReason: range.gateReason,
    };

    if (baseConfidence < CONFIDENCE_THRESHOLD) {
      flagged.push({
        extraction,
        reason: 'low_confidence',
        details: `Confidence ${baseConfidence} below threshold ${CONFIDENCE_THRESHOLD}`,
      });
    }

    normalized.push(obs);
  }

  return { normalized, flagged };
}
