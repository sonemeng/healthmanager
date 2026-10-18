import type { RawExtraction, NormalizedObservation, FlaggedExtraction, NormalizationResult } from './types';
import { CONFIDENCE_THRESHOLD } from '@openvitals/common';
import { checkUnitConsistency, checkMagnitudeBand, canonicalUnit } from './units';

export interface DemographicRange {
  sex: string | null;
  ageMin: number | null;
  ageMax: number | null;
  rangeLow: number | null;
  rangeHigh: number | null;
  /**
   * spec 19（v0.1.14）：该行的单位口径。
   * NULL = 字典基准单位行（国标/通行，数值写在 metric.unit 下）；
   * 非 NULL = 学习行（数值写在该单位下，来自用户确认的报告原文；
   * source 为互认标识如「陕HR」或「检验科区间」）。
   */
  unit: string | null;
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
 * L4 包含层的「限定词」闸（2026-10-18，串项缺陷根治）。
 *
 * 包含匹配本身无法区分「同一项目的不同写法」和「另一个检验项目」：
 *   - 「红细胞计数」↔「红细胞」  → 同一项目，多出的是写法（计数）
 *   - 「平均红细胞蛋白量」↔「红细胞」 → **另一个项目**（MCH），多出的是限定词
 * 旧实现只看包含关系，用户库里 4 个指标串了 21 条观测（rbc 吞掉尿沉渣红细胞/
 * MCH/异形红细胞/有核红细胞，wbc 吞掉尿沉渣白细胞/白细胞团/酯酶）。
 *
 * 判定：较长的名字减掉较短的名字，剩下的字符若只由「中性写法词」组成 → 允许 L4；
 * 只要残留里还有任何实质限定词（平均/有核/异形/尿/沉渣/透明/小圆/团/非…）→ 拒绝 L4，
 * 让这条分析物去 L1–L3 精确命中，或落到自学习新建**独立条目**。
 * 失败方向是「多一个条目」而不是「两条数据串在一起」——后者会污染趋势与参考区间。
 */
/**
 * 残留里出现这些词 → 视为「同一项目的写法差异」，L4 允许通过。
 * 两类：
 *   1) 书写差异：计数/测定/定量/浓度/量/比值/结合力/cv/sd…
 *   2) **标本词**：尿/血清/血浆/全血。同一分析物在报告上常省略标本前缀
 *      （「微量白蛋白」=「尿微量白蛋白」、「酮体」=「尿酮体」），
 *      这类省略不能当成限定词拒掉。
 * 注意「沉渣」不在此列——「尿沉渣红细胞」与「红细胞」是两个项目。
 */
const NEUTRAL_RESIDUALS = [
  '计数',
  '测定',
  '定量',
  '定性',
  '浓度',
  '含量',
  '检查',
  '结果',
  '值',
  '空腹',
  '随机',
  '比值',
  '结合力',
  '量',
  'cv',
  'sd',
  '尿',
  '血清',
  '血浆',
  '全血',
  // 必须按长度降序处理：否则单字「值」会先把「比值」拆成「比」，
  // 残留里凭空多出一个限定词（2026-10-18 差分探针实测踩到）。
].sort((a, b) => b.length - a.length);

function hasQualifierResidual(analyte: string, defName: string): boolean {
  const long = analyte.length >= defName.length ? analyte : defName;
  const short = long === analyte ? defName : analyte;
  if (!long.includes(short)) return false; // 非包含关系（或含多次），不在此闸判定
  let rest = long.split(short).join('');
  for (const neutral of NEUTRAL_RESIDUALS) rest = rest.split(neutral).join('');
  return rest.length > 0;
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
  wbc: { contains: ['酯酶', '团', '尿'] },
  // 红细胞是全库最容易被吞的名字：血常规 RBC 之外还有尿沉渣红细胞、MCH、
  // 异形红细胞率、有核红细胞、红细胞压积/分布宽度。这一层是兜底，
  // 主闸在 hasQualifierResidual（按残留限定词判定）。
  rbc: {
    contains: [
      '平均红细胞',
      '有核红细胞',
      '异形红细胞',
      '畸形红细胞',
      '红细胞比容',
      '红细胞压积',
      '分布宽度',
      '尿',
      '沉渣',
    ],
  },
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
    // 限定词闸：多出来的字不是「计数/测定」这类写法差异，而是另一个项目的限定词
    // （平均红细胞…/有核红细胞…/尿沉渣红细胞、非透明管型、小圆上皮细胞…）→ 本层不成立
    if (hasQualifierResidual(cleaned, c)) continue;
    const minLen = Math.min(c.length, cleaned.length);
    const maxLen = Math.max(c.length, cleaned.length);
    const score = 400 + Math.floor((200 * minLen) / maxLen);
    if (score > best) best = score;
  }
  return best;
}

/** 条目声明过的单位集合（字典基准单位 + 参考区间行单位），用于 L3 平分的单位裁决 */
function declaredUnits(def: MetricDefinition): string[] {
  const raw = [def.unit, ...(def.demographicRanges ?? []).map((r) => r.unit)];
  const out: string[] = [];
  for (const u of raw) {
    const c = canonicalUnit(u ?? null);
    if (c) out.push(c);
  }
  return out;
}

/**
 * 评分制匹配（替代「逐层 find 首个命中」）：对全部字典条目计分取最高，
 * **平分时先看单位是否对得上，再按 metric id 字典序 tie-break**
 * （保证确定性，不依赖 DB 无 ORDER BY 的返回顺序）。
 *
 * 单位裁决解决的是裸名歧义：「红细胞」+「/μL」是尿沉渣红细胞，
 * 「红细胞」+「10^12/L」是血常规 RBC —— 两者名字一模一样，只有单位能分开。
 * 只在**同分**时生效，不影响 L1–L3 的层级优先关系。
 * 无命中返回 null → unmatched flagged（交由自学习/人工复核）。
 */
export function matchMetric(
  analyte: string,
  metricDefinitions: MetricDefinition[],
  obsUnit?: string | null
): MetricDefinition | null {
  const lowerAnalyte = analyte.toLowerCase().trim();
  const cleaned = cleanForMatch(analyte);
  if (cleaned.length === 0) return null;
  const canonObsUnit = canonicalUnit(obsUnit ?? null);

  let best: MetricDefinition | null = null;
  let bestScore = 0;
  let bestUnitHit = false;

  for (const def of metricDefinitions) {
    const score = scoreDefinition(def, lowerAnalyte, cleaned);
    if (score <= 0) continue;
    const unitHit =
      canonObsUnit !== null && declaredUnits(def).includes(canonObsUnit);
    const better =
      score > bestScore ||
      (score === bestScore &&
        ((unitHit && !bestUnitHit) ||
          (unitHit === bestUnitHit && (best === null || def.id < best.id))));
    if (better) {
      best = def;
      bestScore = score;
      bestUnitHit = unitHit;
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
  // 只考虑字典基准单位行（unit NULL）；学习行（unit 非 NULL，互认标识/检验科区间）
  // 走 Priority-2a 的单位匹配通道，不参与人口学评分（spec 19 §3.3）。
  const baseRanges = ranges.filter((r) => r.unit === null);

  let bestRange: DemographicRange | null = null;
  let bestScore = -1;

  for (const range of baseRanges) {
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
 * 2a. 学习行（unit=观测单位，互认标识如陕HR / 检验科区间）—— 用户确认过的检验科区间，直接采用、不走门禁（spec 19）
 * 2b. Demographic-matched range from reference_ranges table ┐
 * 3. Metric definition fallback                            ┘ 走区间对应性门禁（spec 13 §五）
 *
 * 门禁只作用于 2b/3：字典/人口学区间的数值是在 `metric.unit` 下写的，
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

  // Priority 2a: 学习行（spec 19 §3.3）——unit 与观测单位一致的学习行
  // 直接采用、不走门禁。学习行来自用户确认过的报告原文区间（如肌酐 μmol/L 41~73），
  // 数值与单位天然同源，不存在「错配」问题；多行（不同检验科）时按区间下限
  // 稳定排序取首行，保证确定性。
  if (
    extraction.unit != null &&
    metric.demographicRanges &&
    metric.demographicRanges.length > 0
  ) {
    const obsUnit = canonicalUnit(extraction.unit);
    const learned = metric.demographicRanges
      .filter(
        (r) =>
          r.unit != null &&
          obsUnit != null &&
          canonicalUnit(r.unit) === obsUnit &&
          // 学习行若标了性别，只能用于同性别档案（否则男性报告会套用女性区间）
          (r.sex == null ||
            demographics?.sex == null ||
            r.sex === demographics.sex),
      )
      .sort((a, b) => (a.rangeLow ?? -Infinity) - (b.rangeLow ?? -Infinity));
    if (learned.length > 0) {
      return { low: learned[0]!.rangeLow, high: learned[0]!.rangeHigh };
    }
  }

  // Priority 2b: demographic match（国标/通行行，unit NULL；走门禁）
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
    const metric = matchMetric(extraction.analyte, metricDefinitions, extraction.unit);

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
    // 单侧区间判定（spec 19 §9-③ 拍板开启）：哪边有判哪边——
    // high!=null && value>high 或 low!=null && value<low 即判异常，
    // 使胆红素（≤26）/血脂（≤5.2）等单侧国标区间真正生效。
    // 语义保持：界内 → false（与 0.1.13 一致，别退化成 null 让徽标全变「未判定」）；
    // 完全无区间 → null。差分探针 2026-10-12 两次实测捕获本段括号/语义错误。
    const hasAnyBound = refHigh !== null || refLow !== null;
    const isAbnormal =
      extraction.isAbnormal ??
      (finalValue !== null && hasAnyBound
        ? (refHigh !== null && finalValue > refHigh) ||
          (refLow !== null && finalValue < refLow)
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
