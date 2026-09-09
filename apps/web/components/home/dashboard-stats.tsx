"use client";

import Link from "next/link";
import { Activity, AlertTriangle, Pill, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ElementType;
  href: string;
  accent?: "default" | "warning" | "critical";
  sub?: string;
  underText?: string;
}

function StatCard({
  label,
  value,
  icon: Icon,
  href,
  accent = "default",
  sub,
}: StatCardProps) {
  const accentStyles = {
    default: "text-neutral-900",
    warning: "text-health-warning",
    critical: "text-health-critical",
  };

  return (
    <Link
      href={href}
      className="card p-4 hover:border-accent-300 transition-colors block"
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className="size-3.5 text-neutral-400" />
        <span className="text-[10px] font-mono font-bold uppercase tracking-[0.06em] text-neutral-500">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "text-[28px] font-mono font-semibold tabular-nums leading-none",
            accentStyles[accent],
          )}
        >
          {value}
        </span>
        {sub && (
          <span className="text-[11px] font-mono text-neutral-400">{sub}</span>
        )}
      </div>
    </Link>
  );
}

interface DashboardStatsProps {
  metricCount: number;
  totalResults: number;
  flaggedCount: number;
  criticalCount: number;
  warningCount: number;
  activeMedCount: number;
  discontinuedMedCount: number;
  retestsDueCount: number;
  overdueCount: number;
}

export function DashboardStats({
  metricCount,
  totalResults,
  flaggedCount,
  criticalCount,
  warningCount,
  activeMedCount,
  discontinuedMedCount,
  retestsDueCount,
  overdueCount,
}: DashboardStatsProps) {
  const flagAccent =
    criticalCount > 0
      ? ("critical" as const)
      : flaggedCount > 0
        ? ("warning" as const)
        : ("default" as const);
  const retestAccent =
    retestsDueCount > 0 ? ("warning" as const) : ("default" as const);

  const stats: StatCardProps[] = [
    {
      label: "指标",
      value: metricCount,
      icon: FlaskConical,
      href: "/labs",
      sub: "tracked",
      underText: `Across ${totalResults} total results`,
    },
    {
      label: "异常",
      value: flaggedCount,
      icon: AlertTriangle,
      href: "/labs",
      accent: flagAccent,
      sub: criticalCount > 0 ? `${criticalCount} critical` : undefined,
      underText:
        flaggedCount === 0
          ? "所有指标均在正常范围"
          : `${warningCount} warning, ${criticalCount} critical`,
    },
    {
      label: "用药",
      value: activeMedCount,
      icon: Pill,
      href: "/medications",
      sub: "active",
      underText:
        discontinuedMedCount > 0
          ? `${discontinuedMedCount} discontinued`
          : "Track meds & supplements",
    },
    {
      label: "复查",
      value: retestsDueCount,
      icon: Activity,
      href: "/testing",
      accent: retestAccent,
      sub: retestsDueCount > 0 ? "due" : "正常",
      underText:
        overdueCount > 0
          ? `${overdueCount} overdue`
          : retestsDueCount > 0
            ? "安排下次检查"
            : "所有检查按计划进行",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-1">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="flex flex-col border-r border-b md:border-b-0 border bg-neutral-200 rounded-md"
        >
          <StatCard {...stat} />
          <div className="px-1.5 flex flex-1 items-center">
            <p className="truncate font-mono text-[11px] text-neutral-400">
              {stat.underText}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
