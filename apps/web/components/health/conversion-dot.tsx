import { cn } from "@/lib/utils";
import { conversionTooltip, type ConversionMeta } from "@/lib/conversion";

/**
 * 换算角标（spec 21 §4.9 / D6）。
 *
 * 4px 圆点贴在数值右上角，`absolute` 定位，不占流、不推挤列宽。
 * 颜色语义必须与既有两套分开：
 *  - 区间待定 = 琥珀（要你处理）
 *  - 高/低 = 红/绿（判读结论）
 *  - 换算 = 主色（纯信息性，告诉你这个数字被换过）
 * 换算若也用琥珀，用户会以为每个换算过的值都有问题——和「见待办就点确认」是同一个机理。
 *
 * 用法：数值外层必须 `relative`（父元素加 class），否则 absolute 会定位到页面角落。
 */
export function ConversionDot({
  conversion,
  className,
}: {
  conversion: ConversionMeta | null;
  className?: string;
}) {
  if (!conversion) return null;
  return (
    <span
      className={cn(
        "absolute -right-2 -top-0.5 h-1 w-1 rounded-full bg-accent-500",
        className,
      )}
      title={conversionTooltip(conversion)}
      aria-label="已换算"
      role="img"
    />
  );
}
