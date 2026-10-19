/**
 * 单位写法归一（spec 21 · D8 第二层）。
 *
 * 放在 common 包里，是因为两侧都要用同一份实现：
 *   - packages/ingestion（解析链路）
 *   - apps/web（学习行写入：ensureLearnedRange）
 * web 不依赖 @openvitals/ingestion（会把 worker 的编译链拖进纯前端包），
 * 所以在 common 里保留唯一实现，ingestion/units.ts 再 re-export。
 *
 * 边界：只做「写法归一」与「精确进制记号等价」（K/µL ≡ 10^9/L、M/µL ≡ 10^12/L），
 * **不做任何物理量换算**（不把 mg/dL 的数字改成 mmol/L）。
 */
export function canonicalUnit(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let u = raw.trim();
  if (!u) return null;

  // 1) 微符号统一为 µ (U+00B5)：U+03BC(Greek mu) / U+00B5(micro sign) / 误用字符
  u = u.replace(/[\u03BC\u00B5\uFB00]/g, '\u00B5');
  // 全角斜杠 → 半角
  u = u.replace(/\uFF0F/g, '/');

  // 2) 精确进制记号等价（数值完全不变，仅计数写法不同）
  //    1 K/µL = 1000/µL = 10^3 × 10^6/L = 10^9/L
  //    1 M/µL = 10^6/µL = 10^6 × 10^6/L = 10^12/L
  u = u.replace(/^K\s*\/\s*[uµ]L$/i, '10^9/L');
  u = u.replace(/^M\s*\/\s*[uµ]L$/i, '10^12/L');

  // 3) 分母/分子大小写归一（R5：泛化到任意分子，避免 pg/ml vs pg/mL、ml/min vs mL/min 被误判为不同单位）
  u = u.replace(/^u\s*mol\s*\/\s*l$/i, '\u00B5mol/L'); // umol/l、umol/L
  u = u.replace(/\u00B5mol\s*\/\s*l$/i, '\u00B5mol/L'); // µmol/l
  u = u.replace(/\/\s*l$/i, '/L'); // mg/l → mg/L、mmol/l → mmol/L
  u = u.replace(/\/\s*ml$/i, '/mL'); // pg/ml → pg/mL、ng/ml → ng/mL
  u = u.replace(/\/\s*dl$/i, '/dL'); // mg/dl → mg/dL、g/dl → g/dL
  u = u.replace(/\/\s*ul$/i, '/\u00B5L'); // /ul → /µL
  u = u.replace(/^ml\s*\//i, 'mL/'); // ml/min/1.73m2 → mL/min/1.73m2
  u = u.replace(/^u\s*\/\s*l$/i, 'U/L'); // u/l → U/L
  u = u.replace(/^u\s*\/\s*ml$/i, 'U/mL');

  // 4) 去内部空白
  u = u.replace(/\s+/g, '');

  return u || null;
}
