# HealthManager++ v0.1.27 — 全新安装可用（修复 0.1.26 干净包首装必失败）

> 发布对象：**新用户**。0.1.26 的 `Setup` 包在没装过 HealthManager++ 的机器上装完起不来；
> 本版修的就是这条路。升级用户与个人包本来就不受影响。

## 修了什么

### 1. 干净包全新安装不再启动失败（0.1.26 阻断级）

**0.1.26 现象**：新机器双击 `HealthManager++-Setup-0.1.26-x64.exe` 装完启动，弹框
「HealthManager 无法启动」，正文是一条 psql 外键报错，应用直接退出。

**根因**：启动顺序是「建空库 → 跑完全部迁移 → 最后灌种子数据」。而 `0018` 迁移要给
`reference_ranges` 插区间行，外键要求 `metric_definitions` 里已有对应指标——那一刻该表是空的：

```
psql:0018_dict_china_ranges.sql:279: 错误: 插入或更新表 "reference_ranges" 违反外键约束
  "reference_ranges_metric_code_metric_definitions_id_fk"
DETAIL: 键值对(metric_code)=(wbc)没有在表"metric_definitions"中出现.
```

**现在**：启动顺序改成「建空库 → 建表类迁移 → **先灌字典** → 需要字典的迁移 → 其余种子数据」。
哪个迁移需要字典由文件头的 `@requires-dictionary` 声明（写在 `0018` 上），顺序编排只有一份
（`packages/database/src/bootstrap/plan.ts`），桌面主进程和打包门禁共用它。
升级安装（已有数据库）走原路径不变，一次播种都不会插。

### 2. 新装库的来源标注不再整片缺失

`0018` 之后的环境，即使迁移能过、种子能跑，种子插入的字典与区间也没有 `source_tier`
（来源等级）与 `unit_kind`（单位性质）——因为打标逻辑在 `0024` 里，而它排在种子**前面**，
在空表上匹配 0 行，补标永远追不上后来才灌进去的数据。

把字典播种提前到 `0024/0026` **之前**后，这两步的回填第一次打在真实行上：

| 表 | 行数 | `source_tier` 缺失 | `unit_kind` 缺失 |
| --- | --- | --- | --- |
| `metric_definitions` | 154 | **0** | **0** |
| `reference_ranges` | 117 | **0** | — |

来源等级分布（新装库实测）：national_standard 35 / textbook 52 / guideline 8 / instrument 3 /
unverified 56。其中 24 条 unverified 是「新装库还没有任何报告」的指标（镁、血磷、间接胆红素、
中性粒细胞百分比等），校验器按 WARN 列为「来源待补」，不影响使用；用户导入带区间的报告后
会自动变成 `lab_learned`。

### 3. 打包门禁第一次覆盖「真正卖出去的那条路」

以前 `audit:metrics` 只连开发机真实库（已升级形态），干净包那条路从来没被验过——所以一个
必然失败的产品能一路绿灯打包。现在 `prepare-runtime` 会在构建出 `bootstrap/run.js` 之后跑
`verify:clean-install`：

```
独立 scratch 集群 → 建空库 → 按编排分相迁移 + 字典播种 → 跑包内 bootstrap/run.js
→ 校验 ERROR 必须 = 0，且 provenance 缺失 = 0、无重复区间、指标数/区间数在合理量级
```

任一项不成立就中断打包。门禁读的是 `desktop-runtime/app/migrations`（即将装进包的那份 SQL），
不是源码目录。

### 4. 一处校验断言按实际语义收敛

`0026` 的迁移内硬断言原来要求「每条 unverified 字典条目都必须有 citation / citation_kind」。
新装库有 24 条**没有任何区间行**的条目（见上），它们没有「出处」可认领，强行标
`citation_kind='exempt'` 等于把「其实有国标、只是新装还没区间行」说成「本来就没有通行区间」，
属于伪造来源。因此断言收敛为：**名下至少有一条区间行的条目**仍然硬性要求认领（有区间却说不出
出处仍然是缺陷），无区间的条目交给校验器 R8 以 WARN 呈现。已有用户的库不受影响（该断言在
升级库上本来匹配 0 行）。

## 验证方式

- **修复前基线复现**：独立集群按旧顺序执行，在 `0018_dict_china_ranges.sql:279` 复现
  `(metric_code)=(wbc)` 外键失败，与 0.1.26 现象一致。
- **修复后**：`verify:clean-install` 通过 —— 27 个迁移 + 1 次字典播种 + 完整种子，
  154 指标 / 117 区间，provenance 缺失 0、重复区间 0、校验器 ERROR 0 / WARN 24。
- **收敛差分**（新装库 vs 0.1.26 真实库副本）：双方共有的 117 条区间来源等级**逐条一致**，
  `unit_kind` / `citation_kind` 无一不一致；仅参考库多出 92 条用户报告学成的学习行，
  另有 24 个指标的等级差异（参考库 `lab_learned` ↔ 新装 `unverified`），已确认由「空库没有报告」解释。
- **门禁能红**：临时摘掉 `0018` 的 `@requires-dictionary` 标记后门禁立即失败；
  迁移目录未刷新到 staging 时也会失败。
- **升级路径不变**：编排探针显示「全部已应用 → 0 迁移 0 播种」「state 丢失 applied → 27 迁移 0 播种」
  「仅 0000-0010 基线 → 16 迁移 0 播种」。
- 11 个包 `tsc --noEmit` 全绿；桌面端 `tsup` 构建通过（`build/main.js` 含编排逻辑，
  `bootstrap/run.js` 含 `--dictionary-only`）。

## 安装提示（与旧版相同）

```bat
set TMP=D:\t
set TEMP=D:\t
HealthManager++-Setup-0.1.27-x64.exe
```

同时设 `TMP` 与 `TEMP` 到短路径，否则安装器可能静默跳过上千个超长路径文件。
数据目录：`%APPDATA%\@openvitals\desktop\data`。

## 已知边界

- 新装库有 24 个指标暂时没有参考区间行（只有字典内置区间），判读时按报告单区间为准；
  导入含区间的报告后会自动学习。
- 干净包校验是本版新增的，只覆盖字典与 provenance 形态；应用能否出主窗口仍需实机验证。
