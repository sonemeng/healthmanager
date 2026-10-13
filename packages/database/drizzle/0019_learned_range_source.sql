-- 0019 · 学习行来源标识化（2026-10-12 用户拍板）
-- 背景：旧版 0018 第 7 步把学习行 source 统一写成「化验单学习」；
--       用户拍板改为动态取观测行 metadata_json 的互认标识（如「陕HR」），
--       无标识时用专业口径「检验科区间」（无互认标识不称互认，避免误导）。
-- 通道说明：desktop 迁移按文件名跟踪（desktop-state.json 的 appliedMigrations），
--       已应用旧版 0018 的库存量修正只能走本迁移；新装机由新版 0018 直接写对，本迁移为 no-op。
-- 幂等性：纯 UPDATE，可重复执行；learning 行按 (metric, unit, low, high) 与观测行对齐。

SET client_encoding = 'UTF8';

-- 重算 source：对每键优先取带互认标识的观测行（与新版 0018 第 7 步同口径）。
UPDATE reference_ranges AS r
SET source = sub.new_source
FROM (
  SELECT DISTINCT ON (o.metric_code, o.unit, o.reference_range_low, o.reference_range_high)
    o.metric_code,
    o.unit,
    o.reference_range_low  AS low,
    o.reference_range_high AS high,
    COALESCE(NULLIF(o.metadata_json->>'interopMark', ''), '检验科区间') AS new_source
  FROM observations o
  WHERE o.status IN ('confirmed','corrected')
    AND o.unit IS NOT NULL
    AND nullif(o.unit, '') IS NOT NULL
    AND (o.reference_range_low IS NOT NULL OR o.reference_range_high IS NOT NULL)
  ORDER BY o.metric_code, o.unit, o.reference_range_low, o.reference_range_high,
    (NULLIF(o.metadata_json->>'interopMark', '') IS NOT NULL) DESC
) AS sub
WHERE r.source = '化验单学习'
  AND r.unit IS NOT NULL
  AND r.metric_code = sub.metric_code
  AND r.unit = sub.unit
  AND r.range_low  IS NOT DISTINCT FROM sub.low
  AND r.range_high IS NOT DISTINCT FROM sub.high;--> statement-breakpoint

-- 兜底：观测行已不存在的孤儿学习行（如观测被删除），source 换成专业口径、不留在旧措辞上。
UPDATE reference_ranges
SET source = '检验科区间'
WHERE source = '化验单学习';--> statement-breakpoint
