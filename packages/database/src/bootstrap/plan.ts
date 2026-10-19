/**
 * 桌面端「全新安装」引导顺序（v0.1.27 · 07 号坑 19/20）
 *
 * 背景：main.ts 原顺序是「建空库 → 跑完全部迁移 → 最后 seed」。但 0018 起的数据迁移
 * 直接给 reference_ranges 插行，外键要求 metric_definitions 里已有对应指标——空库时
 * 必炸（实测 psql rc=3，键值对 (metric_code)=(wbc) 不存在）。而且 0024 的 provenance
 * 回填排在 seed 前面，空表上匹配 0 行，新装库的 source_tier / unit_kind 永远补不上。
 *
 * 因此把编排拆成两相，并让「哪一步需要字典」由迁移文件自己声明（文件头写
 * `@requires-dictionary`），而不是在代码里写死 0018：
 *
 *   建空库 → [建表类迁移 …] → seed --dictionary-only（字典先行，喂外键）
 *          → [需要字典的迁移 …]                    ← 0024/0026 的回填终于打在真实行上
 *          → seed（其余：参考区间 / 最优区间 / 单位换算 / 面板模板 / 检验机构）
 *
 * 升级库（state.databaseInitialized=true）走原路径：不播种，只在 pending 迁移上按序补跑；
 * 字典本来就有内容，所以不会插入 seed 步骤。
 *
 * 这个模块是**唯一真源**：Electron 主进程与 `verify:clean-install` 门禁都调它，
 * 避免「门禁验的顺序 ≠ 应用跑的顺断」这类门禁空转（07 号坑 20 的成因）。
 */

/** 迁移文件头出现该标记 = 本迁移假设 metric_definitions 已有数据 */
export const DICTIONARY_SEED_MARKER = '@requires-dictionary';

export interface MigrationSource {
  name: string;
  sql: string;
}

export type BootstrapStep =
  | { kind: 'migrate'; name: string }
  | { kind: 'seed-dictionary' };

export interface PlanOptions {
  /** 空库新装（state 里没有 databaseInitialized） */
  isNewInstall: boolean;
}

/**
 * 按文件名字典序（与 `readdir().sort()` 一致）给出执行步骤。
 * 只在「新装 + 遇到第一个带标记的 pending 迁移」时插入一次字典播种；
 * 已经装过的库（applied 里已有 0018）不会插入，保持历史行为不变。
 */
export function planBootstrapSteps(
  migrations: MigrationSource[],
  applied: string[],
  options: PlanOptions,
): BootstrapStep[] {
  const appliedSet = new Set(applied);
  const ordered = [...migrations].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const steps: BootstrapStep[] = [];
  let dictionaryReady = !options.isNewInstall;

  for (const migration of ordered) {
    if (appliedSet.has(migration.name)) continue;
    if (!dictionaryReady && migration.sql.includes(DICTIONARY_SEED_MARKER)) {
      steps.push({ kind: 'seed-dictionary' });
      dictionaryReady = true;
    }
    steps.push({ kind: 'migrate', name: migration.name });
  }

  return steps;
}
