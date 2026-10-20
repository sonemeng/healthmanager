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
| `reference_ranges` | 133 | **0** | — |

校验器结果：**ERROR 0 / WARN 0**，即 154 条字典里没有一条再被列为「来源待补」。

### 3. 字典最后 24 条「有区间、没区间行」的条目补齐（新增 `0027`）

`0018` 第 3 段把这批指标的单位与基准区间改成了中国口径（写进 `metric_definitions`），
第 6 段却只为其中 88 条插了 `reference_ranges` 行——**基准列有值、区间表没行**，两处不同步。
来源等级是按区间行推断的，于是这 24 条在空库里被标成 `unverified`。

新增 `0027_dict_fill_missing_ranges.sql`，按 `19-附录-字典中国化全量对照表` 的定稿结论处理：

- **16 条补区间行**，数值**从字典基准列派生**（不重抄，将来改值只有一处真源）：
  WS/T 405-2012 血常规 10 条、WS/T 404.6-2015 镁与血磷 —— 标 `national_standard`；
  球蛋白、间接胆红素、UACR、胱抑素C（通行口径/推算项）—— 如实标 `textbook`，不为它们伪造标准号背书。
- **8 条不编数值**：胆碱酯酶、果糖胺、血小板压积（PCT）、PDW、P-LCC、P-LCR、RDW-SD、尿肌酐。
  它们方法/仪器依赖，附录已定稿「置空」；迁移里把「为什么没有」写成
  `citation_kind='exempt'` + 一句可复核的豁免依据，而不是留一个说不清的空洞。

### 4. 打包门禁第一次覆盖「真正卖出去的那条路」

以前 `audit:metrics` 只连开发机真实库（已升级形态），干净包那条路从来没被验过——所以一个
必然失败的产品能一路绿灯打包。现在 `prepare-runtime` 会在构建出 `bootstrap/run.js` 之后跑
`verify:clean-install`：

```
独立 scratch 集群 → 建空库 → 按编排分相迁移 + 字典播种 → 跑包内 bootstrap/run.js
→ 校验 ERROR 必须 = 0，且 provenance 缺失 = 0、无重复区间、指标数/区间数在合理量级
```

任一项不成立就中断打包。门禁读的是 `desktop-runtime/app/migrations`（即将装进包的那份 SQL），
不是源码目录。

## 验证方式

- **修复前基线复现**：独立集群按旧顺序执行，在 `0018_dict_china_ranges.sql:279` 复现
  `(metric_code)=(wbc)` 外键失败，与 0.1.26 现象一致。
- **修复后**：`verify:clean-install` 通过 —— **28 个迁移** + 1 次字典播种 + 完整种子，
  **154 指标 / 133 区间**，provenance 缺失 0、重复区间 0、校验器 **ERROR 0 / WARN 0**。
- **补行前后对比**：补之前同一门禁是 117 区间、WARN 24；补之后 133 区间、WARN 0。
- **收敛差分**（新装库 vs 0.1.26 真实库副本，0027 之前做的）：双方共有的 117 条区间来源等级
  **逐条一致**，`unit_kind` / `citation_kind` 无一不一致；参考库多出 92 条用户报告学成的学习行。
  0027 插的是 `unit IS NULL` 的字典基准行，与学习行（`unit` 必非空）键不同，可并存不冲突。
- **门禁能红**：临时摘掉 `0018` 的 `@requires-dictionary` 标记后门禁立即失败；
  迁移目录未刷新到 staging 时也会失败。
- **升级路径不变**：编排探针显示「全部已应用 → 0 迁移 0 播种」「state 丢失 applied → 全量重放 0 播种」
  「仅 0000-0010 基线 → 只跑 0011 之后」。
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

- 「方法/仪器依赖」的 8 个指标（胆碱酯酶、果糖胺、PCT/PDW/P-LCC/P-LCR/RDW-SD、尿肌酐）
  仍无字典参考区间 —— 这是**有依据的置空**，不是漏做；判读以报告单区间为准。
- 干净包校验覆盖字典与 provenance 形态；应用能否出主窗口仍需实机验证。
