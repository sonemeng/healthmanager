/**
 * 存量观测修复脚本（一次性维护工具）。两种模式：
 *
 * 【默认 / --apply】值·单位·区间错位重建（上一轮）：
 *   历史版本归一化时强制把 umol/L/mmol/L 换算成字典单位（mg/dL），
 *   但参考区间照抄原文数值，造成数值/单位/区间三者错位。
 *   从 source_artifacts.raw_text_extracted 重走新版 normalizeExtractions，
 *   删除并重建该任务的 observations；confirmed 记录保持 confirmed。
 *
 * 【--rehang】挂靠修正（方案 A+C / spec 13 §七）：
 *   用新评分制匹配器从 original_value_text（回退 value_text）重算 metric_code，
 *   **值/单位/区间一律不动，只改挂靠**；confirmed 保留；unmatched flagged 行二次归位。
 *   先 dry-run 输出对照表 → 用户过目 → --rehang --apply 逐条 UPDATE。
 *
 * 用法（在 services/ingestion-worker 目录下）：
 *   $env:DATABASE_URL='postgresql://postgres@127.0.0.1:43002/healthmanager'
 *   npx tsx scripts/repair-observations.ts                      # 重建 dry-run
 *   npx tsx scripts/repair-observations.ts --apply              # 重建写库
 *   npx tsx scripts/repair-observations.ts --rehang             # 挂靠 dry-run
 *   npx tsx scripts/repair-observations.ts --rehang --apply     # 挂靠写库
 */
import { getDb } from '@openvitals/database/client';
import type { Database } from '@openvitals/database/client';
import {
  importJobs,
  sourceArtifacts,
  observations,
  metricDefinitions,
  unitConversions,
  referenceRanges,
  users,
} from '@openvitals/database';
import { eq } from 'drizzle-orm';
import type { RawExtraction, UserDemographics, DemographicRange, MetricDefinition } from '@openvitals/ingestion';
import { normalizeExtractions, matchMetric } from '@openvitals/ingestion';

const APPLY = process.argv.includes('--apply');
const REHANG = process.argv.includes('--rehang');

interface OldRow {
  id: string;
  metricCode: string;
  originalValueText: string | null;
  valueText: string | null;
  status: string;
  valueNumeric: number | null;
  unit: string | null;
  correctionNote: string | null;
}

function parseRawJson(raw: string): any | null {
  try {
    const jsonStr = raw
      .replace(/^```(?:json)?\s*\n?/m, '')
      .replace(/\n?```\s*$/m, '')
      .trim();
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

/** 与 parsers/lab-image.ts 完全一致的 RawExtraction 映射 */
function toExtractions(parsed: any): RawExtraction[] {
  const fallbackDate = parsed.collectionDate ?? parsed.reportDate ?? null;
  const rows = (parsed.results ?? []) as any[];
  return rows
    .filter((r) => r.analyte && String(r.analyte).trim().length > 0)
    .map((r) => ({
      analyte: String(r.analyte).trim(),
      value: typeof r.value === 'number' ? r.value : null,
      valueText: r.valueText ?? (r.value != null ? String(r.value) : null),
      unit: r.unit ?? null,
      referenceRangeLow: typeof r.referenceRangeLow === 'number' ? r.referenceRangeLow : null,
      referenceRangeHigh: typeof r.referenceRangeHigh === 'number' ? r.referenceRangeHigh : null,
      referenceRangeText: r.referenceRangeText ?? null,
      isAbnormal: typeof r.isAbnormal === 'boolean' ? r.isAbnormal : null,
      observedAt: r.observedAt ?? fallbackDate ?? null,
      category: 'lab_result' as const,
    }));
}

interface RehangChange {
  id: string;
  oldCode: string;
  newCode: string;
  newCategory: string;
  analyte: string;
  isConfirmed: boolean;
  newStatus: string;
  /** 已有 correction_note（追加而非覆盖，避免冲掉区间门禁等既有修复记录） */
  existingNote: string | null;
}

/**
 * --rehang：挂靠修正。值/单位/区间不动，只改 metric_code（+category 同步）。
 * confirmed 保留；其余成功重挂的置为 extracted；仍 unmatched 的原样保留。
 */
async function runRehang(db: Database, metricDefs: MetricDefinition[]): Promise<void> {
  const rows = await db
    .select({
      id: observations.id,
      metricCode: observations.metricCode,
      originalValueText: observations.originalValueText,
      valueText: observations.valueText,
      status: observations.status,
      correctionNote: observations.correctionNote,
    })
    .from(observations)
    .orderBy(observations.observedAt);

  const changes: RehangChange[] = [];
  for (const r of rows) {
    const text = (r.originalValueText ?? r.valueText ?? '').trim();
    if (!text) continue;
    const def = matchMetric(text, metricDefs);
    if (!def) continue; // 仍 unmatched → 保持原样（存量修复只重挂，不自学习）
    if (def.id === r.metricCode) continue; // 无变化
    const isConfirmed = r.status === 'confirmed';
    changes.push({
      id: r.id,
      oldCode: r.metricCode,
      newCode: def.id,
      newCategory: def.category,
      analyte: text,
      isConfirmed,
      newStatus: isConfirmed ? 'confirmed' : 'extracted',
      existingNote: r.correctionNote ?? null,
    });
  }

  const wrongHang = changes.filter((c) => c.oldCode !== 'unmatched');
  const rehomed = changes.filter((c) => c.oldCode === 'unmatched');

  console.log(
    `观测总数 ${rows.length}；需重挂 ${changes.length} 条` +
      `（挂错纠正 ${wrongHang.length} + unmatched 二次归位 ${rehomed.length}）` +
      `${APPLY ? '（写库模式）' : '（dry-run 预览，加 --apply 实际执行）'}\n`,
  );
  console.log('observation_id'.padEnd(37) + '| 旧 code'.padEnd(26) + '| 新 code'.padEnd(26) + '| conf | 原文');
  console.log('-'.repeat(150));
  for (const c of changes) {
    console.log(
      `${c.id.padEnd(35)}| ${c.oldCode.padEnd(24)}| ${c.newCode.padEnd(24)}| ${c.isConfirmed ? 'Y  ' : '   '} | ${c.analyte}`,
    );
  }

  if (!APPLY) {
    console.log(`\n以上 ${changes.length} 条为待重挂清单（未写库）。复核无误后加 --apply 执行。`);
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  await db.transaction(async (tx) => {
    for (const c of changes) {
      await tx
        .update(observations)
        .set({
          metricCode: c.newCode,
          category: c.newCategory,
          status: c.newStatus,
          // 追加而非覆盖：保留既有修复记录（如区间门禁置空说明）
          correctionNote: [c.existingNote, `挂靠修正：${c.oldCode} → ${c.newCode}（${today} 自动修复）`]
            .filter((s) => s && s.trim().length > 0)
            .join(' | '),
          updatedAt: new Date(),
        })
        .where(eq(observations.id, c.id));
    }
  });
  console.log(`\n✓ 已写库：${changes.length} 条重挂完成。`);
}

async function main() {
  const db = getDb();

  // ── 字典 / 换算表 / 参考区间（与 steps/normalize.ts 完全一致）──
  const metrics = await db.select().from(metricDefinitions);
  const conversions = await db.select().from(unitConversions);
  const ranges = await db.select().from(referenceRanges);
  const rangesByMetric = new Map<string, DemographicRange[]>();
  for (const r of ranges) {
    const list = rangesByMetric.get(r.metricCode) ?? [];
    list.push({ sex: r.sex, ageMin: r.ageMin, ageMax: r.ageMax, rangeLow: r.rangeLow, rangeHigh: r.rangeHigh });
    rangesByMetric.set(r.metricCode, list);
  }
  const metricDefs = metrics.map((m) => ({
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

  // ── 模式分派：--rehang 走挂靠修正（spec 13 §七），否则走重建流程 ──
  if (REHANG) {
    await runRehang(db, metricDefs);
    return;
  }

  // ── 目标：全部化验单任务 ──
  const jobs = await db
    .select({
      id: importJobs.id,
      userId: importJobs.userId,
      profileId: importJobs.profileId,
      sourceArtifactId: importJobs.sourceArtifactId,
      createdAt: importJobs.createdAt,
    })
    .from(importJobs)
    .where(eq(importJobs.classifiedType, 'lab_report'))
    .orderBy(importJobs.createdAt);

  console.log(`共 ${jobs.length} 个化验单任务${APPLY ? '（写库模式）' : '（dry-run 预览，加 --apply 实际执行）'}\n`);

  let totalRepaired = 0;

  for (const job of jobs) {
    const [artifact] = await db
      .select({ rawTextExtracted: sourceArtifacts.rawTextExtracted })
      .from(sourceArtifacts)
      .where(eq(sourceArtifacts.id, job.sourceArtifactId))
      .limit(1);

    const raw = artifact?.rawTextExtracted ?? '';
    if (!raw) {
      console.log(`⚠ 跳过 ${job.id}（无 raw_text_extracted）`);
      continue;
    }
    const parsed = parseRawJson(raw);
    if (!parsed || !Array.isArray(parsed.results)) {
      console.log(`⚠ 跳过 ${job.id}（raw_text_extracted 不是 AI JSON）`);
      continue;
    }

    // 用户人口学信息（与 normalize.ts 一致，用于参考区间匹配）
    const [user] = await db
      .select({ dateOfBirth: users.dateOfBirth, biologicalSex: users.biologicalSex })
      .from(users)
      .where(eq(users.id, job.userId))
      .limit(1);
    let demographics: UserDemographics | null = null;
    if (user) {
      let ageInYears: number | null = null;
      if (user.dateOfBirth) {
        const dob = new Date(user.dateOfBirth);
        const now = new Date();
        ageInYears = now.getFullYear() - dob.getFullYear();
        const monthDiff = now.getMonth() - dob.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) ageInYears--;
      }
      demographics = { sex: user.biologicalSex ?? null, ageInYears };
    }

    const extractions = toExtractions(parsed);
    const { normalized, flagged } = normalizeExtractions(extractions, metricDefs, unitConvs, 0.85, demographics);

    // 旧记录：构建 confirmed 键集合（metricCode + 原项目名）
    const oldRows: OldRow[] = await db
      .select({
        id: observations.id,
        metricCode: observations.metricCode,
        originalValueText: observations.originalValueText,
        valueText: observations.valueText,
        status: observations.status,
        valueNumeric: observations.valueNumeric,
        unit: observations.unit,
        correctionNote: observations.correctionNote,
      })
      .from(observations)
      .where(eq(observations.importJobId, job.id));

    const key = (metricCode: string, analyte: string | null | undefined) =>
      `${metricCode}|${(analyte ?? '').trim()}`;
    const confirmedKeys = new Set(
      oldRows.filter((r) => r.status === 'confirmed').map((r) => key(r.metricCode, r.originalValueText))
    );

    // 门禁行（reason='range_unit_mismatch'）**已经**以 matched 指标落过 normalized（仅区间被置空），
    // 若再以 metricCode='unmatched' 插一条，会造成同一数据重复入库 + 假复核项
    // → 与 steps/materialize.ts 的 flaggedForInsert 过滤保持一致（R1）
    const flaggedForInsert = flagged.filter((f) => f.reason !== 'range_unit_mismatch');

    // 旧 correction_note 按「原文项目名」保留（重挂会改 metricCode，按 metricCode 找不到旧行）（R1）
    const oldNoteByAnalyte = new Map<string, string>();
    for (const r of oldRows) {
      const k = (r.originalValueText ?? '').trim();
      if (k && r.correctionNote) oldNoteByAnalyte.set(k, r.correctionNote);
    }

    // 新行（字段映射与 steps/materialize.ts 一致）
    const insertRows = [
      ...normalized.map((obs) => ({
        userId: job.userId,
        profileId: job.profileId,
        metricCode: obs.metricCode,
        category: obs.category,
        valueNumeric: obs.valueNumeric,
        valueText: obs.valueText,
        unit: obs.unit,
        referenceRangeLow: obs.referenceRangeLow,
        referenceRangeHigh: obs.referenceRangeHigh,
        referenceRangeText: obs.referenceRangeText,
        isAbnormal: obs.isAbnormal,
        status: confirmedKeys.has(key(obs.metricCode, obs.analyte)) ? 'confirmed' : 'extracted',
        confidenceScore: obs.confidenceScore,
        observedAt: obs.observedAt,
        observedAtIsFallback: obs.observedAtIsFallback ?? false,
        sourceArtifactId: job.sourceArtifactId,
        importJobId: job.id,
        originalValueText: obs.analyte ?? null,
        // 保留旧留痕（如区间门禁说明），不要因重写而清空（R1）
        correctionNote: oldNoteByAnalyte.get((obs.analyte ?? '').trim()) ?? null,
      })),
      ...flaggedForInsert.map((f) => ({
        userId: job.userId,
        profileId: job.profileId,
        metricCode: 'unmatched',
        category: f.extraction.category ?? 'lab_result',
        valueNumeric: f.extraction.value,
        valueText: f.extraction.valueText,
        unit: f.extraction.unit,
        referenceRangeLow: f.extraction.referenceRangeLow,
        referenceRangeHigh: f.extraction.referenceRangeHigh,
        referenceRangeText: f.extraction.referenceRangeText,
        isAbnormal: f.extraction.isAbnormal,
        status: confirmedKeys.has(key('unmatched', f.extraction.analyte)) ? 'confirmed' : 'flagged',
        confidenceScore: null as number | null,
        observedAt: f.extraction.observedAt ? new Date(f.extraction.observedAt) : new Date(),
        observedAtIsFallback: !f.extraction.observedAt,
        sourceArtifactId: job.sourceArtifactId,
        importJobId: job.id,
        originalValueText: f.extraction.analyte,
        correctionNote: `${f.reason}: ${f.details}`,
      })),
    ];

    // 新集合里缺失的旧 confirmed 行（不应发生，发生则警告）
    const newKeySet = new Set(insertRows.map((r) => key(r.metricCode, r.originalValueText)));
    for (const r of oldRows) {
      if (r.status === 'confirmed' && !newKeySet.has(key(r.metricCode, r.originalValueText))) {
        console.log(`  !! 警告：旧 confirmed 行在新结果中找不到对应：${r.metricCode} / ${r.originalValueText}`);
      }
    }

    // 数值/单位发生变化的行（这次修复的核心目标）
    const changed: string[] = [];
    for (const newRow of insertRows) {
      if (newRow.metricCode === 'unmatched') continue;
      const old = oldRows.find(
        (r) => key(r.metricCode, r.originalValueText) === key(newRow.metricCode, newRow.originalValueText)
      );
      if (old && (old.valueNumeric !== newRow.valueNumeric || (old.unit ?? '') !== (newRow.unit ?? ''))) {
        changed.push(
          `    ${newRow.originalValueText}(${newRow.metricCode}): ${old.valueNumeric} ${old.unit ?? ''} → ${newRow.valueNumeric} ${newRow.unit ?? ''}`
        );
      }
    }

    console.log(
      `任务 ${job.id} (${job.createdAt.toISOString().slice(0, 10)})：` +
        `旧 ${oldRows.length} 行（confirmed ${confirmedKeys.size}）→ 新 ${insertRows.length} 行` +
        `（normalized ${normalized.length} + flagged ${flaggedForInsert.length}` +
        `${flagged.length !== flaggedForInsert.length ? `，另有 ${flagged.length - flaggedForInsert.length} 条区间门禁行已随 matched 指标落库` : ''}）` +
        `，数值/单位变化 ${changed.length} 条`
    );
    changed.forEach((c) => console.log(c));
    totalRepaired += changed.length;

    if (!APPLY) continue;

    // 事务：删旧插新；extraction_count 同步为 normalized 数；
    // 任务状态保持不变（review_needed 是工作流状态，不因重写数据翻转）
    await db.transaction(async (tx) => {
      await tx.delete(observations).where(eq(observations.importJobId, job.id));
      if (insertRows.length > 0) {
        await tx.insert(observations).values(insertRows);
      }
      await tx
        .update(importJobs)
        .set({ extractionCount: normalized.length })
        .where(eq(importJobs.id, job.id));
    });
    console.log(`  ✓ 已写库`);
  }

  console.log(`\n合计：${totalRepaired} 条观测的数值/单位将被修正${APPLY ? '（已完成）' : '（未写库）'}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('修复脚本失败：', err);
  process.exit(1);
});
