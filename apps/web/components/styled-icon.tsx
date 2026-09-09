import { HomeIcon } from "lucide-react";
import type { IconType } from "./animated-empty-state";
import { cn } from "@/lib/utils";
import { CornerEdge } from "./decorations/corner-cross";

export function StyledIcon({
  icon: Icon,
  className,
  iconClassName,
}: {
  icon: IconType;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <div
      className={cn(
        "relative size-8 bg-neutral-100 flex items-center justify-center",
        className,
      )}
    >
      <CornerEdge location={"*"} />
      <Icon className={cn("size-4 text-accent-500", iconClassName)} />
    </div>
  );
}
