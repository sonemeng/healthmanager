SET client_encoding = 'UTF8';

-- spec 21 §4.7 存量处置：清掉 5 条「入库那一刻的门禁快照」。
--
-- 依据不是猜测：2026-10-19 用今天的字典 + 学习行 + 人口学，对每一条重跑 resolveReferenceRange
-- 探针（结果见 21 号方案 §13.6）：
--   dysmorphic_rbc_pct  0.0 %   —— 0021 改挂指标（rbc → dysmorphic_rbc_pct）时留下的旧文案，
--                                  旧挂 rbc 的单位是 10^12/L；现指标单位 % 且不设数值区间，
--                                  重算根本不触发门禁 → 纯过期文案
--   其余 4 条（urine_glucose / urine_leukocyte_esterase / urine_protein / urine_wbc）
--                              —— value_numeric 为 NULL（原文 "-" / "1+"），属定性/无值 → 重算走豁免；
--                                 旧文案「观测单位缺失」与现状（unit 已有值）也自相矛盾
--
-- 5 条重算后都**解不出区间**，所以没有一条需要「归位」补区间（方案原估 1 条可归位，探针未复现）；
-- status 一律不动：现状 confirmed 是人工背书过的，机器不许翻案。
-- 只删 metadata_json 的 gateReason 键，其它键（analyteNote / interopMark）、值、区间、状态一律不碰。
--
-- 逐条 id 定位（不用 LIKE，可复盘）；幂等：第二次执行时 gateReason 已不存在 → 影响 0 行。
UPDATE observations
SET metadata_json = metadata_json - 'gateReason',
    updated_at = NOW()
WHERE metadata_json ? 'gateReason'
  AND id IN (
    '57f16a5e-d011-4043-88af-bd166f217579',
    '15098ae5-62bb-4b8a-8f2e-dd02a273fb91',
    '4ddd1b88-ec17-42d0-9ab2-1d2e0c363f55',
    '519c7d90-2339-4d78-9377-4e51b43ceb2b',
    '5e4b9b71-ecfb-4a07-a884-c125a459e2e9'
  );
