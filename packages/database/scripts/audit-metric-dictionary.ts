/**
 * 指标字典校验器（spec 21 · S0a 机制 2）
 *
 * 打包前置门禁：`pnpm prepare-runtime` 开跑前执行，**ERROR > 0 直接阻断打包**。
 * 规则全部机器可判，避免「看起来对」代替「验证过」。
 *
 * 用法：
 *   DATABASE_URL=postgresql://... pnpm --filter @openvitals/database audit:metrics
 *   未给 DATABASE_URL 时默认连本地桌面版内嵌库（127.0.0.1:43002）。
 *
 * 退出码：0 = 无 ERROR；1 = 有 ERROR（打印清单）。
 */
import { Pool } from 'pg';
import { canonicalUnit, checkMagnitudeBand, checkUnitConsistency } from '../../ingestion/src/units';

const CONNECTION = process.env.DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:43002/healthmanager';

interface Issue {
  level: 'ERROR' | 'WARN';
  rule: string;
  detail: string;
}

interface MetricRow {
  id: string;
  name: string;
  unit: string | null;
  unit_kind: string | null;
  source_tier: string | null;
  citation: string | null;
  reference_range_low: number | null;
  reference_range_high: number | null;
}

interface RangeRow {
  id: number;
  metric_code: string;
  unit: string | null;
  sex: string | null;
  age_min: number | null;
  age_max: number | null;
  range_low: number | null;
  range_high: number | null;
  source: string | null;
  source_tier: string | null;
  observation_id: string | null;
  conflict_status: string | null;
}

function pct(a: number, b: number): number {
  const base = Math.max(Math.abs(a), Math.abs(b));
  return base === 0 ? 0 : (Math.abs(a - b) / base) * 100;
}

function divergesMoreThan20Pct(
  a: { low: number | null; high: number | null },
  b: { low: number | null; high: number | null },
): boolean {
  const oneSide = (x: number | null, y: number | null): boolean => {
    if (x === null || y === null) return false;
    const base = Math.max(Math.abs(x), Math.abs(y));
    return base > 0 && Math.abs(x - y) > 0.2 * base;
  };
  return oneSide(a.low, b.low) || oneSide(a.high, b.high);
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: CONNECTION });
  const issues: Issue[] = [];

  try {
    const metrics = (await pool.query(
      `select id, name, unit, unit_kind, source_tier, citation,
              reference_range_low, reference_range_high
       from metric_definitions order by id`,
    )).rows as MetricRow[];

    const ranges = (await pool.query(
      `select id, metric_code, unit, sex, age_min, age_max, range_low, range_high,
              source, source_tier, observation_id, conflict_status
       from reference_ranges order by metric_code, id`,
    )).rows as RangeRow[];

    const metricById = new Map(metrics.map((m) => [m.id, m]));

    // ── R1 单位写法必须是 canonicalUnit 的规范形 ─────────────────────────────
    for (const m of metrics) {
      if (m.unit === null) continue;
      const canonical = canonicalUnit(m.unit);
      if (m.unit !== canonical) {
        issues.push({ level: 'ERROR', rule: 'R1', detail: `字典 ${m.id}.unit = ${JSON.stringify(m.unit)}，规范形应为 ${JSON.stringify(canonical)}` });
      }
    }
    for (const r of ranges) {
      if (r.unit === null) continue;
      const canonical = canonicalUnit(r.unit);
      if (r.unit !== canonical) {
        issues.push({ level: 'ERROR', rule: 'R1', detail: `区间 #${r.id} (${r.metric_code}).unit = ${JSON.stringify(r.unit)}，规范形应为 ${JSON.stringify(canonical)}` });
      }
    }

    // ── R2 unit_kind 与 unit 的一致性 ────────────────────────────────────────
    for (const m of metrics) {
      if (m.unit_kind === 'quantitative' && (m.unit === null || m.unit === '')) {
        issues.push({ level: 'ERROR', rule: 'R2', detail: `定量指标 ${m.id} 没有单位` });
      }
      if (m.unit_kind === 'dimensionless' && m.unit !== null && m.unit !== '') {
        issues.push({ level: 'ERROR', rule: 'R2', detail: `无量纲指标 ${m.id} 声明了单位 ${JSON.stringify(m.unit)}` });
      }
      if (m.unit_kind === null) {
        issues.push({ level: 'ERROR', rule: 'R2', detail: `指标 ${m.id} 缺少 unit_kind` });
      }
      if (m.source_tier === null) {
        issues.push({ level: 'ERROR', rule: 'R2', detail: `指标 ${m.id} 缺少 source_tier` });
      }
    }

    // ── R3 区间上下界不得颠倒（0~0 零宽白名单）────────────────────────────────
    const checkBounds = (tag: string, low: number | null, high: number | null): void => {
      if (low === null || high === null) return;
      if (low === 0 && high === 0) return; // 阴性零宽区间，0021 已把滴虫改掉，其余保留白名单
      if (low >= high) {
        issues.push({ level: 'ERROR', rule: 'R3', detail: `${tag} 区间上下颠倒：${low} >= ${high}` });
      }
    };
    for (const m of metrics) checkBounds(`字典 ${m.id}`, m.reference_range_low, m.reference_range_high);
    for (const r of ranges) checkBounds(`区间 #${r.id} (${r.metric_code})`, r.range_low, r.range_high);

    // ── R4 qualitative 不得有数值区间 ────────────────────────────────────────
    for (const m of metrics) {
      if (m.unit_kind !== 'qualitative') continue;
      if (m.reference_range_low !== null || m.reference_range_high !== null) {
        issues.push({ level: 'ERROR', rule: 'R4', detail: `定性指标 ${m.id} 带数值区间` });
      }
    }

    // ── R5 区间必须落在该指标的量级带内 ──────────────────────────────────────
    for (const m of metrics) {
      if (m.reference_range_low === null && m.reference_range_high === null) continue;
      if (m.unit_kind !== 'quantitative') continue;
      const gate = checkMagnitudeBand(m.id, m.unit, m.reference_range_low, m.reference_range_high);
      if (!gate.ok) {
        issues.push({ level: 'ERROR', rule: 'R5', detail: `字典 ${m.id}：${gate.reason ?? '量级带不匹配'}` });
      }
    }

    // ── R6 同一 key 不得出现完全重复行；多来源实质分歧 → WARN 清单 ────────────
    const byKey = new Map<string, RangeRow[]>();
    for (const r of ranges) {
      const key = [r.metric_code, canonicalUnit(r.unit) ?? '∅', r.sex ?? '∅', r.age_min ?? '∅', r.age_max ?? '∅'].join('|');
      const list = byKey.get(key) ?? [];
      list.push(r);
      byKey.set(key, list);
    }

    for (const [key, list] of byKey) {
      const exact = new Map<string, RangeRow[]>();
      for (const r of list) {
        const k = `${r.range_low ?? '∅'}|${r.range_high ?? '∅'}`;
        const group = exact.get(k) ?? [];
        group.push(r);
        exact.set(k, group);
      }
      for (const [, group] of exact) {
        if (group.length > 1) {
          issues.push({ level: 'ERROR', rule: 'R6', detail: `key ${key} 有 ${group.length} 条完全相同的区间行（id: ${group.map((g) => g.id).join(', ')}）` });
        }
      }

      // 同 key 不同区间且差异 >20% → 冲突清单（WARN，不自动修）
      for (let i = 0; i < list.length; i += 1) {
        for (let j = i + 1; j < list.length; j += 1) {
          const a = list[i]!;
          const b = list[j]!;
          if (!divergesMoreThan20Pct({ low: a.range_low, high: a.range_high }, { low: b.range_low, high: b.range_high })) continue;
          const detail =
            `${a.metric_code} ${a.unit ?? ''} sex=${a.sex ?? '任意'} ` +
            `${a.range_low ?? '—'}~${a.range_high ?? '—'} (${a.source ?? '无来源'}) vs ` +
            `${b.range_low ?? '—'}~${b.range_high ?? '—'} (${b.source ?? '无来源'})` +
            (a.range_low !== null && b.range_low !== null ? `，下限差 ${pct(a.range_low, b.range_low).toFixed(1)}%` : '') +
            (a.range_high !== null && b.range_high !== null ? `，上限差 ${pct(a.range_high, b.range_high).toFixed(1)}%` : '');
          issues.push({ level: 'WARN', rule: 'R6', detail: `来源冲突：${detail}` });
        }
      }
    }

    // ── R7 lab_learned 必须有来源观测（可点回原报告）────────────────────────
    for (const r of ranges) {
      if (r.source_tier !== 'lab_learned') continue;
      if (r.observation_id === null) {
        issues.push({ level: 'ERROR', rule: 'R7', detail: `学习行 #${r.id} (${r.metric_code} ${r.range_low ?? '—'}~${r.range_high ?? '—'} ${r.unit ?? ''}) 没有 observation_id 溯源` });
      }
    }

    // ── R9 字典单位 vs 真实报告单位不一致清单（S0a 交付物，WARN）────────────
    const obsUnits = (await pool.query(
      `select metric_code, unit, count(*)::int as n
       from observations where unit is not null group by 1, 2 order by 1, 3 desc`,
    )).rows as Array<{ metric_code: string; unit: string; n: number }>;

    for (const o of obsUnits) {
      const m = metricById.get(o.metric_code);
      if (!m || m.unit === null) continue;
      // 等价类（mEq/L 等）已在 checkUnitConsistency 内处理；不一致才报
      if (checkUnitConsistency(o.unit, m.unit, o.metric_code).ok) continue;
      issues.push({
        level: 'WARN',
        rule: 'R9',
        detail: `观测 ${o.metric_code} 用 ${o.unit}（${o.n} 条），字典单位 ${m.unit} —— 该指标若有区间兜底，会被门禁拦下`,
      });
    }

    // ── R8 unverified 清单（不阻断，但必须可见）──────────────────────────────
    const unverifiedMetrics = metrics.filter((m) => m.source_tier === 'unverified');
    const unverifiedRanges = ranges.filter((r) => r.source_tier === 'unverified');
    for (const m of unverifiedMetrics) {
      issues.push({ level: 'WARN', rule: 'R8', detail: `字典 ${m.id}（${m.name}）来源待补` });
    }
    for (const r of unverifiedRanges) {
      issues.push({ level: 'WARN', rule: 'R8', detail: `区间 #${r.id} (${r.metric_code} ${r.unit ?? ''} ${r.range_low ?? '—'}~${r.range_high ?? '—'}) 来源待补${r.source ? `（source=${r.source}）` : ''}` });
    }

    // ── 汇总 ──────────────────────────────────────────────────────────────────
    const errors = issues.filter((i) => i.level === 'ERROR');
    const warns = issues.filter((i) => i.level === 'WARN');

    console.log(`[audit-metric-dictionary] ${metrics.length} 个指标 / ${ranges.length} 条区间`);
    console.log(`[audit-metric-dictionary] ERROR ${errors.length} / WARN ${warns.length}\n`);

    for (const i of issues) {
      console.log(`${i.level === 'ERROR' ? '[ERROR]' : '[WARN ]'} ${i.rule} ${i.detail}`);
    }

    if (errors.length > 0) {
      console.error(`\n[audit-metric-dictionary] 校验失败：${errors.length} 个 ERROR，禁止打包。`);
      process.exitCode = 1;
      return;
    }
    console.log('\n[audit-metric-dictionary] 通过（ERROR = 0）。');
  } finally {
    await pool.end();
  }
}

void main().catch((err) => {
  console.error('[audit-metric-dictionary] 执行失败：', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
