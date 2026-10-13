// 病史-指标映射字典（spec 20 §6.2 P5「按病史聚合病程视图」）
// 2026-10-13 用户逐条确认定稿：
//   - 慢性肾功能不全 → 肾功能 8 项；2 型糖尿病 → 血糖 3 项；脑梗死 → 血脂 6 项；
//   - 高血压留空不映射（字典无血压项，检验单通常不含血压，不硬造映射）。
// 所有 code 均已对 seed 字典（metric-definitions.ts）核实存在。
// key 与 conditions.name 精确匹配（首尾空白 trim 后比对）；未收录的病史名 → 空数组，
// 病程时间线入口不放开。
export const CONDITION_METRIC_MAP: Record<string, readonly string[]> = {
  "慢性肾功能不全": [
    "creatinine",
    "bun",
    "uric_acid",
    "cystatin_c",
    "egfr",
    "uacr",
    "malb",
    "urine_creatinine",
  ],
  "2型糖尿病": ["glucose", "hemoglobin_a1c", "fructosamine"],
  "脑梗死": [
    "cholesterol_total",
    "triglycerides",
    "ldl_cholesterol",
    "hdl_cholesterol",
    "non_hdl_cholesterol",
    "vldl_cholesterol",
  ],
};

/** 取病史的映射指标 code（无映射返回空数组） */
export function metricsForCondition(name: string): readonly string[] {
  return CONDITION_METRIC_MAP[name.trim()] ?? [];
}

/** 病程时间线入口的数据门槛：映射指标合计观测 ≥ N 条才放开（spec 20 §6.2） */
export const CONDITION_TIMELINE_MIN_OBS = 3;
