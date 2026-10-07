import { getDb } from '@openvitals/database/client';
import type { Database } from '@openvitals/database/client';
import { importJobs, metricDefinitions, unitConversions, referenceRanges, users } from '@openvitals/database';
import { eq } from 'drizzle-orm';
import type { WorkflowContext } from '../workflow';
import type { RawExtraction, NormalizationResult, MetricDefinition } from '@openvitals/ingestion';
import { normalizeExtractions, matchMetric, cleanForMatch } from '@openvitals/ingestion';
import type { UserDemographics, DemographicRange } from '@openvitals/ingestion';

/**
 * 自学习条目 id 后缀：FNV-1a 32-bit → base36。
 * 稳定可复算——同一清洗名必然算出同一 id，保证「先查后插」幂等。
 */
export function hashCleanedName(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/** 自学习条目 category 关键词启发式（spec 13 §四.1） */
export function inferAutoCategory(cleaned: string): string {
  if (cleaned.includes('尿')) return 'urinalysis';
  if (cleaned.includes('细胞') || cleaned.includes('血红蛋白') || cleaned.includes('血小板')) return 'hematology';
  if (cleaned.includes('蛋白')) return 'metabolic';
  return 'metabolic';
}

/**
 * C6 别名加闸：清洗名若已被该条目的 name/aliases 覆盖，说明原文只是同一条目的异写
 * （如「钾(陕HR)」清洗后就是 name「钾」），追加进字典纯属噪声 → 不追加。
 */
function isCoveredByDef(def: { name: string; aliases: string[] }, cleaned: string): boolean {
  if (cleanForMatch(def.name) === cleaned) return true;
  return def.aliases.some((a) => cleanForMatch(a) === cleaned);
}

interface AutoLearnCandidate {
  analyte: string;
  first: RawExtraction;
}

/**
 * 收集需要自学习的 extract 项：flagged 中 reason='unmatched_metric'，
 * 且 analyte 非空、值非空（value 或 valueText 至少一个）。按清洗名去重，取首现。
 */
function collectAutoLearnCandidates(result: NormalizationResult): AutoLearnCandidate[] {
  const seen = new Set<string>();
  const out: AutoLearnCandidate[] = [];
  for (const f of result.flagged) {
    if (f.reason !== 'unmatched_metric') continue;
    const analyte = f.extraction.analyte?.trim();
    if (!analyte) continue;
    if (f.extraction.value == null && f.extraction.valueText == null) continue;
    const key = cleanForMatch(analyte);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ analyte, first: f.extraction });
  }
  return out;
}

/**
 * 方案 A 自学习（spec 13 §四）：
 *  a) cleanForMatch(原文) → 清洗名
 *  b) 用清洗名重跑 matchMetric —— 命中既有条目则不建，只把原文变体追加进该条目 aliases
 *  c) 未命中 → INSERT 新条目（id = 'auto_' + 清洗名 hash；loincCode 一律 NULL；unit/区间照抄报告首现值）
 * 任何单条失败都不抛出（崩溃安全），仅记日志。
 */
export async function ensureAutoMetric(
  analyte: string,
  first: RawExtraction,
  currentDefs: MetricDefinition[],
  dbArg?: Database,
): Promise<void> {
  const db = dbArg ?? getDb();
  const cleanedName = cleanForMatch(analyte);
  if (!cleanedName) return;

  try {
    // b) 清洗名重跑匹配
    const hit = matchMetric(cleanedName, currentDefs);
    if (hit) {
      // C6 闸：清洗后已被该条目 name/aliases 覆盖 → 原文是同一条目的异写，不灌噪声
      if (isCoveredByDef(hit, cleanedName)) return;
      // 追加**清洗名**而非原文：清洗名才是匹配实际比较的对象，
      // 也避免把「(陕HR)」这类版式标记写进人工字典
      const nextAliases = Array.from(new Set([...hit.aliases, cleanedName]));
      await db.update(metricDefinitions)
        .set({ aliases: nextAliases })
        .where(eq(metricDefinitions.id, hit.id));
      hit.aliases = nextAliases; // 同步内存字典，后续候选可命中
      return;
    }

    // c) INSERT 新条目（先查后插，幂等）
    const id = `auto_${hashCleanedName(cleanedName)}`;
    const [existing] = await db
      .select({ name: metricDefinitions.name, aliases: metricDefinitions.aliases })
      .from(metricDefinitions)
      .where(eq(metricDefinitions.id, id))
      .limit(1);

    if (existing) {
      // id 由清洗名 hash 决定 → 存在即代表已为该清洗名建过条目，name 已等于清洗名，
      // 必然被覆盖 → 直接返回，不再追加别名（C6：幂等且不产生噪声）
      if (!isCoveredByDef({ name: existing.name, aliases: (existing.aliases as string[] | null) ?? [] }, cleanedName)) {
        const nextAliases = Array.from(new Set([...(existing.aliases as string[] | null) ?? [], cleanedName]));
        await db.update(metricDefinitions)
          .set({ aliases: nextAliases })
          .where(eq(metricDefinitions.id, id));
      }
      return;
    }

    const category = inferAutoCategory(cleanedName);
    const today = new Date().toISOString().slice(0, 10);
    await db.insert(metricDefinitions).values({
      id,
      name: cleanedName, // C5：清洗名（不再存含「(陕HR)」的首现原文）
      category,
      unit: first.unit ?? null,
      loincCode: null, // 一律不自动填，人工复核时补
      aliases: [cleanedName],
      referenceRangeLow: first.referenceRangeLow,
      referenceRangeHigh: first.referenceRangeHigh,
      referenceRangeText: first.referenceRangeText,
      description: `自学习条目，待人工复核（自动生成于 ${today}）`,
      sortOrder: 9999,
    }).onConflictDoNothing({ target: metricDefinitions.id });

    // 加入内存字典，同一批后续候选可直接命中
    currentDefs.push({
      id,
      name: cleanedName, // C5：与落库一致，避免内存/落库名字不一致
      category,
      unit: first.unit ?? null,
      aliases: [cleanedName],
      referenceRangeLow: first.referenceRangeLow,
      referenceRangeHigh: first.referenceRangeHigh,
    });
  } catch (err) {
    console.error(`[normalize] ensureAutoMetric failed for "${analyte}":`, err instanceof Error ? err.message : err);
  }
}

export async function normalize(
  ctx: WorkflowContext,
  extractions: RawExtraction[]
): Promise<NormalizationResult> {
  const db = getDb();

  await db.update(importJobs)
    .set({ status: 'normalizing' })
    .where(eq(importJobs.id, ctx.importJobId));

  console.log(`[normalize] Normalizing ${extractions.length} extractions for job=${ctx.importJobId}`);

  // Fetch metric definitions from database
  const metrics = await db.select().from(metricDefinitions);
  const conversions = await db.select().from(unitConversions);

  // Fetch reference ranges and group by metric code
  const ranges = await db.select().from(referenceRanges);
  const rangesByMetric = new Map<string, DemographicRange[]>();
  for (const r of ranges) {
    const existing = rangesByMetric.get(r.metricCode) ?? [];
    existing.push({
      sex: r.sex,
      ageMin: r.ageMin,
      ageMax: r.ageMax,
      rangeLow: r.rangeLow,
      rangeHigh: r.rangeHigh,
    });
    rangesByMetric.set(r.metricCode, existing);
  }

  // Fetch user demographics
  let demographics: UserDemographics | null = null;
  const [user] = await db
    .select({ dateOfBirth: users.dateOfBirth, biologicalSex: users.biologicalSex })
    .from(users)
    .where(eq(users.id, ctx.userId))
    .limit(1);

  if (user) {
    let ageInYears: number | null = null;
    if (user.dateOfBirth) {
      const dob = new Date(user.dateOfBirth);
      const now = new Date();
      ageInYears = now.getFullYear() - dob.getFullYear();
      const monthDiff = now.getMonth() - dob.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
        ageInYears--;
      }
    }
    demographics = {
      sex: user.biologicalSex ?? null,
      ageInYears,
    };
  }

  const metricDefs: MetricDefinition[] = metrics.map((m) => ({
    id: m.id,
    name: m.name,
    category: m.category,
    unit: m.unit,
    aliases: (m.aliases as string[]) ?? [],
    referenceRangeLow: m.referenceRangeLow,
    referenceRangeHigh: m.referenceRangeHigh,
    demographicRanges: rangesByMetric.get(m.id),
  }));

  const unitConvs = conversions.map((c) => ({
    fromUnit: c.fromUnit,
    toUnit: c.toUnit,
    metricCode: c.metricCode,
    multiplier: c.multiplier,
    offset: c.offset,
  }));

  // ── 第一遍：用现有字典归一化 ────────────────────────────────────────────────
  let result = normalizeExtractions(extractions, metricDefs, unitConvs, 0.85, demographics);

  // ── 方案 A：自学习（两遍法）─────────────────────────────────────────────────
  const candidates = collectAutoLearnCandidates(result);
  if (candidates.length > 0) {
    console.log(`[normalize] Self-learning ${candidates.length} unmatched analyte(s)`);
    // ensureAutoMetric 在第二遍之前执行；单条失败不影响第一遍已有结果
    for (const { analyte, first } of candidates) {
      await ensureAutoMetric(analyte, first, metricDefs);
    }

    // 重新查全量字典，第二遍重跑：新条目/新别名即可命中
    const refreshed = await db.select().from(metricDefinitions);
    const defs2: MetricDefinition[] = refreshed.map((m) => ({
      id: m.id,
      name: m.name,
      category: m.category,
      unit: m.unit,
      aliases: (m.aliases as string[]) ?? [],
      referenceRangeLow: m.referenceRangeLow,
      referenceRangeHigh: m.referenceRangeHigh,
      demographicRanges: rangesByMetric.get(m.id),
    }));
    result = normalizeExtractions(extractions, defs2, unitConvs, 0.85, demographics);
    console.log(
      `[normalize] After self-learning: ${result.normalized.length} normalized, ${result.flagged.length} flagged`,
    );
  }

  await db.update(importJobs)
    .set({ normalizeCompletedAt: new Date() })
    .where(eq(importJobs.id, ctx.importJobId));

  return result;
}
