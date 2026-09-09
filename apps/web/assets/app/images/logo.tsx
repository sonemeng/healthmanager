import { cn } from "@/lib/utils";

export function Logo(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      {...props}
    >
      <path
        d="M2.5 12h4l2-5.5L11.5 18l2.5-8 1.5 4h6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type LogoWordmarkProps = React.ComponentProps<"div"> & {
  logoProps?: React.SVGProps<SVGSVGElement>;
  workmarkProps?: React.ComponentProps<"span">;
};
export function LogoWordmark({
  logoProps: { className: logoClassName, ...logoProps } = {},
  workmarkProps: { className: wordmarkClassName, ...workmarkProps } = {},
  className,
  ...props
}: LogoWordmarkProps) {
  return (
    <div
      className={cn("flex items-center gap-1.5 text-inherit", className)}
      {...props}
    >
      <Logo className={cn("size-6", logoClassName)} {...logoProps} />
      <span
        className={cn("text-[16px] font-semibold font-mono", wordmarkClassName)}
        {...workmarkProps}
      >
        HealthManager++
      </span>
    </div>
  );
}
