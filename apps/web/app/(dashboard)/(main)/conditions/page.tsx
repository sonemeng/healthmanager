"use client";

import { trpc } from "@/lib/trpc/client";
import { useModal } from "@/components/modal/provider";
import { AddConditionModal } from "@/components/health/add-condition-modal";
import {
  StatusBadge,
  type HealthStatus,
} from "@/components/health/status-badge";
import { formatDate } from "@/lib/utils";
import { AnimatedEmptyState } from "@/components/animated-empty-state";
import { Button } from "@/components/button";
import {
  Plus,
  HeartPulse,
  Calendar,
  User,
  MoreVertical,
  Stethoscope,
  CheckCircle2,
  AlertCircle,
  Download,
} from "lucide-react";
import { downloadCsv, downloadText } from "@/lib/export";
import { ModuleImports } from "@/components/health/module-imports";
import { cn } from "@/lib/utils";
import { useState } from "react";

const severityStatus: Record<string, HealthStatus> = {
  mild: "info",
  moderate: "warning",
  severe: "critical",
};

export default function ConditionsPage() {
  const { data: conditions, isLoading } = trpc.conditions.list.useQuery();
  const modal = useModal();
  const utils = trpc.useUtils();

  const updateMutation = trpc.conditions.update.useMutation({
    onSuccess: () => utils.conditions.list.invalidate(),
  });

  const deleteMutation = trpc.conditions.delete.useMutation({
    onSuccess: () => utils.conditions.list.invalidate(),
  });

  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const active = conditions?.filter((c) => c.status === "active") ?? [];
  const resolved = conditions?.filter((c) => c.status === "resolved") ?? [];

  if (isLoading) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div className="card h-8 w-48 animate-pulse bg-neutral-50" />
          <div className="card h-9 w-36 animate-pulse bg-neutral-50" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card h-24 animate-pulse bg-neutral-50" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[24px] font-display font-medium tracking-[-0.03em] text-neutral-900">
            Conditions
          </h1>
          <p className="text-[13px] text-neutral-500 font-body mt-1">
            记录你的健康状况与诊断
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline-subtle" size="sm" icon={<Download />} text="导出详细文档" onClick={() => downloadText("healthmanager-conditions-detail", ["# HealthManager 病史记录", "", `生成日期：${new Date().toISOString().slice(0, 10)}`, "", ...(conditions?.length ? conditions.map((c) => `## ${c.name}\n- 状态：${c.status ?? "未记录"}\n- 严重程度：${c.severity ?? "未记录"}\n- 起始日期：${c.onsetDate ?? "未记录"}\n- 解决日期：${c.resolutionDate ?? "未记录"}\n- 诊断医生：${c.diagnosedBy ?? "未记录"}\n- 备注：${c.notes ?? "无"}`) : ["暂无病史记录。"]), "", "本文件含个人健康信息，仅应分享给可信的家人、照护者或医疗专业人员。"].join("\n\n"), "text/markdown;charset=utf-8", "md")} />
          {conditions && conditions.length > 0 && (
            <>
            <Button
              variant="outline-subtle"
              size="sm"
              icon={<Download />}
              text="导出 CSV"
              onClick={() => {
                downloadCsv(
                  "healthmanager-conditions",
                  [
                    "名称",
                    "状态",
                    "严重程度",
                    "发病日期",
                    "痊愈日期",
                    "诊断医生",
                    "备注",
                  ],
                  conditions.map((c) => [
                    c.name,
                    c.status,
                    c.severity,
                    c.onsetDate,
                    c.resolutionDate,
                    c.diagnosedBy,
                    c.notes,
                  ]),
                );
              }}
            />
            </>
          )}
          <Button
            icon={<Plus />}
            text="添加病史"
            onClick={() => modal.show(<AddConditionModal />)}
          />
        </div>
      </div>

      {conditions?.length === 0 ? (
        <AnimatedEmptyState
          title="暂无病史记录"
          description="Add your health conditions and diagnoses to build a complete health picture."
          cardContent={({ icon: Icon }) => (
            <>
              <div className="flex size-7 items-center justify-center card">
                <Icon className="size-4 text-neutral-400" />
              </div>
              <div className="h-2.5 w-28 min-w-0 bg-neutral-100" />
            </>
          )}
          addButton={
            <Button
              icon={<Plus />}
              text="Add condition"
              onClick={() => modal.show(<AddConditionModal />)}
            />
          }
        />
      ) : (
        <div className="space-y-6">
          {/* 在用（现存）病史 */}
          {active.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="size-3.5 text-neutral-500" />
                <h2 className="text-[13px] font-semibold font-display text-neutral-700 uppercase tracking-[0.04em]">
                  Active
                </h2>
                <span className="bg-neutral-100 px-2 py-0.5 text-[10px] font-mono font-bold text-neutral-500 tabular-nums">
                  {active.length}
                </span>
              </div>
              <div className="space-y-0 border border-neutral-200">
                {active.map((condition) => (
                  <ConditionCard
                    key={condition.id}
                    condition={condition}
                    menuOpen={menuOpen === condition.id}
                    onMenuToggle={() =>
                      setMenuOpen(
                        menuOpen === condition.id ? null : condition.id,
                      )
                    }
                    onResolve={() => {
                      updateMutation.mutate({
                        id: condition.id,
                        status: "resolved",
                        resolutionDate: new Date().toISOString().split("T")[0],
                      });
                      setMenuOpen(null);
                    }}
                    onDelete={() => {
                      deleteMutation.mutate({ id: condition.id });
                      setMenuOpen(null);
                    }}
                  />
                ))}
              </div>
            </section>
          )}

          {/* 已痊愈 */}
          {resolved.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="size-3.5 text-neutral-400" />
                <h2 className="text-[13px] font-semibold font-display text-neutral-500 uppercase tracking-[0.04em]">
                  Resolved
                </h2>
                <span className="bg-neutral-100 px-2 py-0.5 text-[10px] font-mono font-bold text-neutral-500 tabular-nums">
                  {resolved.length}
                </span>
              </div>
              <div className="space-y-0 border border-neutral-200">
                {resolved.map((condition) => (
                  <ConditionCard
                    key={condition.id}
                    condition={condition}
                    menuOpen={menuOpen === condition.id}
                    onMenuToggle={() =>
                      setMenuOpen(
                        menuOpen === condition.id ? null : condition.id,
                      )
                    }
                    onReactivate={() => {
                      updateMutation.mutate({
                        id: condition.id,
                        status: "active",
                      });
                      setMenuOpen(null);
                    }}
                    onDelete={() => {
                      deleteMutation.mutate({ id: condition.id });
                      setMenuOpen(null);
                    }}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
      <ModuleImports target="condition" />
    </div>
  );
}

interface ConditionCardProps {
  condition: {
    id: string;
    name: string;
    severity: string | null;
    status: string | null;
    onsetDate: string | null;
    resolutionDate: string | null;
    diagnosedBy: string | null;
    notes: string | null;
  };
  menuOpen: boolean;
  onMenuToggle: () => void;
  onResolve?: () => void;
  onReactivate?: () => void;
  onDelete: () => void;
}

function ConditionCard({
  condition,
  menuOpen,
  onMenuToggle,
  onResolve,
  onReactivate,
  onDelete,
}: ConditionCardProps) {
  const isActive = condition.status === "active";

  return (
    <div
      className={cn(
        "px-4 py-4 bg-white border-b border-neutral-100 last:border-b-0",
        !isActive && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex items-center justify-center size-8 mt-0.5",
              isActive ? "bg-accent-50" : "bg-neutral-50",
            )}
          >
            <HeartPulse
              className={cn(
                "size-4",
                isActive ? "text-accent-600" : "text-neutral-400",
              )}
            />
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-neutral-900 font-display">
              {condition.name}
            </h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {condition.severity && (
                <StatusBadge
                  status={severityStatus[condition.severity] ?? "neutral"}
                  label={condition.severity}
                />
              )}
              {condition.onsetDate && (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-neutral-400">
                  <Calendar className="size-3" />
                  {formatDate(condition.onsetDate)}
                  {condition.resolutionDate &&
                    ` — ${formatDate(condition.resolutionDate)}`}
                </span>
              )}
              {condition.diagnosedBy && (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-neutral-400">
                  <User className="size-3" />
                  {condition.diagnosedBy}
                </span>
              )}
            </div>
            {condition.notes && (
              <p className="text-[12px] text-neutral-500 font-body mt-2 max-w-lg">
                {condition.notes}
              </p>
            )}
          </div>
        </div>

        {/* Action menu */}
        <div className="relative">
          <button
            onClick={onMenuToggle}
            className="p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors cursor-pointer"
          >
            <MoreVertical className="size-4" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={onMenuToggle} />
              <div className="absolute right-0 top-8 z-20 w-40 bg-white border border-neutral-200 py-1">
                {onResolve && (
                  <button
                    onClick={onResolve}
                    className="w-full px-3 py-2 text-left text-[12px] font-body text-neutral-700 hover:bg-neutral-50 transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <CheckCircle2 className="size-3.5" />
                    标记为已痊愈
                  </button>
                )}
                {onReactivate && (
                  <button
                    onClick={onReactivate}
                    className="w-full px-3 py-2 text-left text-[12px] font-body text-neutral-700 hover:bg-neutral-50 transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <AlertCircle className="size-3.5" />
                    Reactivate
                  </button>
                )}
                <button
                  onClick={onDelete}
                  className="w-full px-3 py-2 text-left text-[12px] font-body text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <Stethoscope className="size-3.5" />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
