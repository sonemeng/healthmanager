/**
 * 全新安装自检门禁（v0.1.27 · 07 号坑 19/20）
 *
 * 为什么需要它：`audit:metrics` 一直只连开发机真实库（已升级形态），而 GitHub Release
 * 发出去的 Setup exe 卖的是「空库 → 全量迁移 → seed」这条路。0.1.26 那条路必然失败
 * （0018 外键），本地打包却一路绿灯——门禁从没覆盖过真正的交付形态。
 *
 * 本脚本把交付形态**整条跑一遍**：
 *   独立 scratch 集群（内嵌 postgres 二进制，端口错开）→ 建空库
 *   → 按 packages/database/src/bootstrap/plan.ts 的编排分相执行（与 desktop main.ts 同一份）
 *   → 跑真实产物 desktop-runtime/app/bootstrap/run.js（打包后就是它，不是源码 tsx）
 *   → computeAudit() 必须 ERROR = 0，且 provenance 不变式必须成立
 *
 * 用法：
 *   pnpm --filter @openvitals/database verify:clean-install
 *   pnpm --filter @openvitals/database verify:clean-install -- --compare=postgresql://postgres@127.0.0.1:43002/healthmanager
 *
 * `--compare` 额外做「新装形态 vs 参考库」差分：同 id 指标的 source_tier / unit_kind /
 * citation_kind、同 key 区间行必须一致（auto_* 与只存在于一侧的行跳过）。这是证明
 * 「新装用户看到的世界 == 升级用户看到的世界」的手段，日常门禁不带这个参数。
 *
 * 子进程一律用**异步 spawn + stdin ignore**：本项目的开发会话里，`spawnSync` 默认
 * `['pipe','pipe','pipe']` 会让 CreateProcess 直接 EBUSY，而拉起 postmaster 时同步等待
 * 还会连整个进程树一起被回收（详见 workbuddy-windows-script-constraints）。
 *
 * 退出码：0 = 通过；1 = 失败（阻断打包）。
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { computeAudit } from './audit-metric-dictionary';
import { planBootstrapSteps, type MigrationSource } from '../src/bootstrap/plan';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');
// 优先验 staged 产物（prepare-runtime 会把迁移复制进 desktop-runtime/app/migrations，
// 打包时用的就是它）——门禁验的必须是真正装进用户机器的那份 SQL，不是源码目录。
const stagedMigrationsDir = path.join(repoRoot, 'desktop-runtime', 'app', 'migrations');
const migrationsDir = existsSync(stagedMigrationsDir) ? stagedMigrationsDir : path.join(repoRoot, 'packages', 'database', 'drizzle');
const bootstrapProgram = path.join(repoRoot, 'desktop-runtime', 'app', 'bootstrap', 'run.js');
const postgresRoot = process.env.POSTGRES_RUNTIME_DIR ?? path.join(repoRoot, 'desktop-runtime', 'postgres');
const postgresBin = path.join(postgresRoot, 'bin');

/** 短路径优先：pg_ctl 的日志、锁文件与 MAX_PATH 都怕长路径（10 号文档 §5.2）。 */
const scratchRoot = process.env.HM_SCRATCH_ROOT ?? (existsSync('D:\\t') ? 'D:\\t' : os.tmpdir());

function log(message: string): void {
  console.log(`[verify-clean-install] ${message}`);
}

function fail(message: string): never {
  throw new Error(message);
}

function tail(text: string, lines = 15): string {
  const all = text.trim().split(/\r?\n/).filter((line) => line.length > 0);
  return all.slice(-lines).join('\n');
}

interface RunResult {
  code: number;
  output: string;
}

function exec(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let output = '';
    child.stdout.on('data', (data: Buffer) => (output += data.toString()));
    child.stderr.on('data', (data: Buffer) => (output += data.toString()));
    child.once('error', (error) => resolve({ code: -1, output: `${output}\nspawn error: ${error.message}` }));
    child.once('exit', (code) => resolve({ code: code ?? -1, output }));
  });
}

async function mustRun(what: string, command: string, args: string[], env: NodeJS.ProcessEnv): Promise<RunResult> {
  const result = await exec(command, args, env);
  if (result.code !== 0) fail(`${what} 失败（exit ${result.code}）\n${tail(result.output)}`);
  return result;
}

async function findFreePort(start: number): Promise<number> {
  for (let port = start; port < start + 40; port += 1) {
    const free = await new Promise<boolean>((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
    });
    if (free) return port;
  }
  return fail(`找不到空闲端口（${start} 起 40 个都占用）`);
}

async function loadMigrations(): Promise<MigrationSource[]> {
  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();
  if (files.length === 0) fail(`迁移目录为空：${migrationsDir}`);
  return Promise.all(
    files.map(async (name) => ({ name, sql: await readFile(path.join(migrationsDir, name), 'utf8') })),
  );
}

interface CleanInstallResult {
  metrics: number;
  ranges: number;
  error: number;
  warn: number;
}

async function runCleanInstall(
  scratch: string,
  referenceConnection?: string,
): Promise<{ result: CleanInstallResult; connectionString: string }> {
  const dataDir = path.join(scratch, 'pgdata');
  const port = await findFreePort(43021);
  const connectionString = `postgresql://postgres@127.0.0.1:${port}/healthmanager`;
  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: connectionString };
  // 别让工作站级的客户端覆盖串进来（与 desktop main.ts 同口径）。
  delete env.PGOPTIONS;
  delete env.PGTZ;

  const initdb = path.join(postgresBin, 'initdb.exe');
  const pgCtl = path.join(postgresBin, 'pg_ctl.exe');
  const createdb = path.join(postgresBin, 'createdb.exe');
  const psql = path.join(postgresBin, 'psql.exe');
  for (const binary of [initdb, pgCtl, createdb, psql, bootstrapProgram]) {
    if (!existsSync(binary)) fail(`缺少运行时文件：${binary}`);
  }

  mkdirSync(scratch, { recursive: true });
  log(`scratch 集群：${scratch}（端口 ${port}）`);

  await mustRun('initdb', initdb, ['-D', dataDir, '-U', 'postgres', '--auth=trust', '--encoding=UTF8'], env);
  await mustRun(
    'pg_ctl start',
    pgCtl,
    ['start', '-D', dataDir, '-l', path.join(scratch, 'postgres.log'), '-o', `-p ${port} -h 127.0.0.1`, '-w'],
    env,
  );

  try {
    await mustRun('createdb healthmanager', createdb, ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', 'healthmanager'], env);

    const steps = planBootstrapSteps(await loadMigrations(), [], { isNewInstall: true });
    const seedSteps = steps.filter((step) => step.kind === 'seed-dictionary').length;
    if (seedSteps !== 1) {
      fail(`编排异常：新装应恰好插入 1 次字典播种，实际 ${seedSteps} 次（检查迁移文件头的 @requires-dictionary 标记）`);
    }

    for (const step of steps) {
      if (step.kind === 'seed-dictionary') {
        await mustRun('字典播种（bootstrap/run.js --dictionary-only）', process.execPath, [bootstrapProgram, '--dictionary-only'], env);
        log('字典播种完成（metric_definitions）');
        continue;
      }
      await mustRun(
        `迁移 ${step.name}`,
        psql,
        ['-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'healthmanager', '-f', path.join(migrationsDir, step.name)],
        env,
      );
    }
    log(`迁移 ${steps.length - seedSteps} 个 + 字典播种 1 次 全部通过`);

    await mustRun('完整 seed（bootstrap/run.js）', process.execPath, [bootstrapProgram], env);
    log('完整 seed 完成');

    const pool = new Pool({ connectionString });
    try {
      const report = await computeAudit(pool);
      const errors = report.issues.filter((issue) => issue.level === 'ERROR');
      if (errors.length > 0) {
        const listed = errors.slice(0, 20).map((issue) => `  ${issue.rule} ${issue.detail}`).join('\n');
        fail(`字典校验有 ${errors.length} 个 ERROR（新装形态禁止打包）：\n${listed}`);
      }

      const invariants = await pool.query<{
        metrics: number;
        ranges: number;
        metric_tier_null: number;
        metric_kind_null: number;
        range_tier_null: number;
        claim_pending: number;
        duplicate_ranges: number;
      }>(`select
           (select count(*)::int from metric_definitions) as metrics,
           (select count(*)::int from reference_ranges) as ranges,
           (select count(*)::int from metric_definitions where source_tier is null) as metric_tier_null,
           (select count(*)::int from metric_definitions where unit_kind is null) as metric_kind_null,
           (select count(*)::int from reference_ranges where source_tier is null) as range_tier_null,
           (select count(*)::int from (
              select 1 from metric_definitions m
              where m.source_tier = 'unverified' and m.citation is null and m.citation_kind is null
                and exists (select 1 from reference_ranges r where r.metric_code = m.id)
              union all
              select 1 from reference_ranges
              where source_tier = 'unverified' and citation is null and citation_kind is null
           ) pending) as claim_pending,
           (select count(*)::int from (
              select 1 from reference_ranges
              group by metric_code, coalesce(unit, '∅'), coalesce(sex, '∅'),
                       coalesce(age_min, -1), coalesce(age_max, -1), range_low, range_high
              having count(*) > 1
           ) dup) as duplicate_ranges`);
      const row = invariants.rows[0]!;

      const problems: string[] = [];
      if (row.metric_tier_null > 0) problems.push(`metric_definitions.source_tier 为 NULL：${row.metric_tier_null} 行`);
      if (row.metric_kind_null > 0) problems.push(`metric_definitions.unit_kind 为 NULL：${row.metric_kind_null} 行`);
      if (row.range_tier_null > 0) problems.push(`reference_ranges.source_tier 为 NULL：${row.range_tier_null} 行`);
      if (row.claim_pending > 0) problems.push(`0026 不变式被破坏（unverified 且无 citation/citation_kind）：${row.claim_pending} 行`);
      if (row.duplicate_ranges > 0) problems.push(`完全重复的区间行：${row.duplicate_ranges} 组`);
      if (row.metrics < 150) problems.push(`指标条数异常偏少：${row.metrics}（期望 ≥150）`);
      if (row.ranges < 100) problems.push(`区间条数异常偏少：${row.ranges}（期望 ≥100）`);
      if (problems.length > 0) fail(`新装形态不变式不成立：\n${problems.map((line) => `  - ${line}`).join('\n')}`);

      log(`库内形态：${row.metrics} 指标 / ${row.ranges} 区间 · provenance 缺失 0 · 重复区间 0`);
      log(`校验器：ERROR ${report.counts.error} / WARN ${report.counts.warn}`);

      // 差分必须在 scratch 集群还活着的时候做（外层 finally 会 stop 它）。
      if (referenceConnection) await compareWithReference(connectionString, referenceConnection);

      return {
        result: { metrics: row.metrics, ranges: row.ranges, error: report.counts.error, warn: report.counts.warn },
        connectionString,
      };
    } finally {
      await pool.end();
    }
  } finally {
    await exec(pgCtl, ['stop', '-D', dataDir, '-m', 'fast'], env);
  }
}

interface ProvRow {
  id: string;
  source_tier: string | null;
  unit_kind: string | null;
  citation_kind: string | null;
}

/** 新装形态 vs 参考库：只比两边都有的行，证明两条路径收敛到同一个世界。 */
async function compareWithReference(fresh: string, reference: string): Promise<void> {
  const freshPool = new Pool({ connectionString: fresh });
  const referencePool = new Pool({ connectionString: reference });
  try {
    const columns = `select id, source_tier, unit_kind, citation_kind from metric_definitions where id not like 'auto\\_%'`;
    const freshMetrics = (await freshPool.query<ProvRow>(columns)).rows;
    const referenceMetrics = new Map((await referencePool.query<ProvRow>(columns)).rows.map((row) => [row.id, row]));

    const diff: string[] = [];
    /** 「新装本来就不可能有」的差异：参考库的 tier 来自用户报告学成的行，空库没有报告。 */
    const expected: string[] = [];
    const freshRangeCount = new Map(
      (await freshPool.query<{ metric_code: string; n: number }>(
        `select metric_code, count(*)::int as n from reference_ranges group by 1`,
      )).rows.map((row) => [row.metric_code, row.n]),
    );

    for (const row of freshMetrics) {
      const other = referenceMetrics.get(row.id);
      if (!other) continue;
      for (const field of ['source_tier', 'unit_kind', 'citation_kind'] as const) {
        if (row[field] === other[field]) continue;
        const explainedLabLearned =
          field === 'source_tier' &&
          other[field] === 'lab_learned' &&
          row[field] === 'unverified' &&
          (freshRangeCount.get(row.id) ?? 0) === 0;
        const line = `metric ${row.id}.${field}: 新装=${row[field] ?? 'NULL'} / 参考=${other[field] ?? 'NULL'}`;
        (explainedLabLearned ? expected : diff).push(line);
      }
    }

    const rangeKey = `concat_ws('|', metric_code, coalesce(unit,'∅'), coalesce(sex,'∅'), coalesce(age_min,-1), coalesce(age_max,-1), range_low, range_high)`;
    const rangeSql = `select ${rangeKey} as key, source_tier from reference_ranges where source_tier is not null`;
    const freshRanges = (await freshPool.query<{ key: string; source_tier: string | null }>(rangeSql)).rows;
    const referenceRanges = new Map(
      (await referencePool.query<{ key: string; source_tier: string | null }>(rangeSql)).rows.map((row) => [row.key, row.source_tier]),
    );

    let shared = 0;
    let onlyFresh = 0;
    for (const row of freshRanges) {
      if (!referenceRanges.has(row.key)) {
        onlyFresh += 1;
        continue;
      }
      shared += 1;
      if (referenceRanges.get(row.key) !== row.source_tier) {
        diff.push(`range ${row.key}.source_tier: 新装=${row.source_tier ?? 'NULL'} / 参考=${referenceRanges.get(row.key) ?? 'NULL'}`);
      }
    }

    log(`差分（跳过 auto_*）：共享区间 ${shared} 条（tier 必须一致）；仅新装 ${onlyFresh} 条；仅参考 ${referenceRanges.size - shared} 条（用户报告学成的学习行）`);
    if (expected.length > 0) {
      log(`可解释差异 ${expected.length} 处：参考库的 tier 来自用户报告（lab_learned），空库没有报告 → unverified + R8「来源待补」`);
    }
    if (onlyFresh > 0) {
      fail(`新装库出现参考库没有的区间行 ${onlyFresh} 条（应来自 0018/0021/0026，说明 seed 又插了一批没打标的行）`);
    }
    if (diff.length > 0) {
      fail(`新装形态与参考库不收敛（${diff.length} 处）：\n${diff.slice(0, 20).map((line) => `  - ${line}`).join('\n')}`);
    }
    log('差分：共享区间与 unit_kind/citation_kind 0 处不一致 —— 新装用户与升级用户看到同一份字典');
  } finally {
    await freshPool.end();
    await referencePool.end();
  }
}

async function main(): Promise<void> {
  const stamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  const scratch = path.join(scratchRoot, `hm-clean-install-${stamp}`);
  const compareArg = process.argv.find((arg) => arg.startsWith('--compare='));
  mkdirSync(scratchRoot, { recursive: true });
  log(`迁移来源：${migrationsDir}`);
  log(`bootstrap：${bootstrapProgram}`);

  try {
    await runCleanInstall(scratch, compareArg?.slice('--compare='.length));
    log('通过：空库 → 全量迁移 → 字典播种 → 完备 seed → 校验 ERROR = 0');
  } catch (error) {
    console.error(`[verify-clean-install] 失败：${error instanceof Error ? error.message : String(error)}`);
    writeFileSync(path.join(scratchRoot, 'hm-clean-install-last-failure.txt'), `${scratch}\n`, 'utf8');
    process.exitCode = 1;
  } finally {
    const previous = process.exitCode;
    try {
      // 删不掉（超长路径 / 被占用）就留着，路径已打印，人工清理。
      rmSync(scratch, { recursive: true, force: true, maxRetries: 2 });
    } catch {
      console.error(`[verify-clean-install] scratch 目录未能自动清理：${scratch}`);
    }
    process.exitCode = previous;
  }
}

void main();
