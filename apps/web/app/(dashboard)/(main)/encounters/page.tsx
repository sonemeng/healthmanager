"use client";

import { trpc } from "@/lib/trpc/client";
import { useModal } from "@/components/modal/provider";
import { AddEncounterModal } from "@/components/health/add-encounter-modal";
import { AnimatedEmptyState } from "@/components/animated-empty-state";
import { Button } from "@/components/button";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useState } from "react";
import {
  Plus,
  Stethoscope,
  Calendar,
  MapPin,
  User,
  MoreVertical,
  Pencil,
  Trash2,
  Clock,
  Download,
  type LucideIcon,
} from "lucide-react";
import { downloadCsv, downloadText } from "@/lib/export";
import { ModuleImports } from "@/components/health/module-imports";

const encounterTypeConfig: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  checkup: {
    label: "体检",
    color: "text-health-normal",
    bg: "bg-green-50",
  },
  specialist: {
    label: "专科门诊",
    color: "text-accent-600",
    bg: "bg-accent-50",
  },
  urgent_care: {
    label: "急诊护理",
    color: "text-health-warning",
    bg: "bg-amber-50",
  },
  emergency: {
    label: "急诊",
    color: "text-health-critical",
    bg: "bg-red-50",
  },
  telehealth: {
    label: "远程医疗",
    color: "text-health-info",
    bg: "bg-blue-50",
  },
  lab_visit: {
    label: "化验检查",
    color: "text-neutral-600",
    bg: "bg-neutral-50",
  },
  imaging: { label: "影像检查", color: "text-neutral-600", bg: "bg-neutral-50" },
  dental: { label: "牙科", color: "text-neutral-600", bg: "bg-neutral-50" },
  therapy: { label: "治疗门诊", color: "text-accent-600", bg: "bg-accent-50" },
  other: { label: "其他", color: "text-neutral-500", bg: "bg-neutral-50" },
};

export default function EncountersPage() {
  const { data: encounters, isLoading } = trpc.encounters.list.useQuery();
  const modal = useModal();
  const utils = trpc.useUtils();

  const deleteMutation = trpc.encounters.delete.useMutation({
    onSuccess: () => utils.encounters.list.invalidate(),
  });

  const [menuOpen, setMenuOpen] = useState<string | null>(null);

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
            Encounters
          </h1>
          <p className="text-[13px] text-neutral-500 font-body mt-1">
            Track your healthcare visits and appointments
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline-subtle" size="sm" icon={<Download />} text="导出详细文档" onClick={() => downloadText("healthmanager-encounters-detail", ["# HealthManager 就诊记录", "", `生成日期：${new Date().toISOString().slice(0, 10)}`, "", ...(encounters?.length ? encounters.map((e) => `## ${e.encounterDate}｜${encounterTypeConfig[e.type]?.label ?? e.type}\n- 医生：${e.provider ?? "未记录"}\n- 医疗机构：${e.facility ?? "未记录"}\n- 主诉：${e.chiefComplaint ?? "未记录"}\n- 摘要：${e.summary ?? "无"}`) : ["暂无就诊记录。"]), "", "本文件含个人健康信息，仅应分享给可信的家人、照护者或医疗专业人员。"].join("\n\n"), "text/markdown;charset=utf-8", "md")} />
          {encounters && encounters.length > 0 && (
            <>
            <Button
              variant="outline-subtle"
              size="sm"
              icon={<Download />}
              text="导出 CSV"
              onClick={() => {
                downloadCsv(
                  "healthmanager-encounters",
                  ["类型", "日期", "医生/机构", "就诊机构", "主诉", "摘要"],
                  encounters.map((e) => [
                    e.type,
                    e.encounterDate,
                    e.provider,
                    e.facility,
                    e.chiefComplaint,
                    e.summary,
                  ]),
                );
              }}
            />
            </>
          )}
          <Button
            icon={<Plus />}
            text="记录就诊"
            onClick={() => modal.show(<AddEncounterModal />)}
          />
        </div>
      </div>

      {encounters?.length === 0 ? (
        <AnimatedEmptyState
          title="暂无就诊记录"
          description="Keep a record of your doctor visits, specialist appointments, and healthcare encounters."
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
              text="记录就诊"
              onClick={() => modal.show(<AddEncounterModal />)}
            />
          }
        />
      ) : (
        <div className="space-y-0 border border-neutral-200">
          {encounters?.map((encounter) => {
            const typeConfig =
              encounterTypeConfig[encounter.type] ?? encounterTypeConfig.other;

            return (
              <div
                key={encounter.id}
                className="px-4 py-4 bg-white border-b border-neutral-100 last:border-b-0"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "flex items-center justify-center size-8 mt-0.5 shrink-0",
                        typeConfig.bg,
                      )}
                    >
                      <Stethoscope className={cn("size-4", typeConfig.color)} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-[14px] font-semibold text-neutral-900 font-display">
                          {typeConfig.label}
                        </h3>
                        {encounter.chiefComplaint && (
                          <span className="text-[13px] text-neutral-600 font-body">
                            — {encounter.chiefComplaint}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono text-neutral-400">
                          <Calendar className="size-3" />
                          {formatDate(encounter.encounterDate)}
                        </span>
                        {encounter.provider && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-neutral-400">
                            <User className="size-3" />
                            {encounter.provider}
                          </span>
                        )}
                        {encounter.facility && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-neutral-400">
                            <MapPin className="size-3" />
                            {encounter.facility}
                          </span>
                        )}
                      </div>
                      {encounter.summary && (
                        <p className="text-[12px] text-neutral-500 font-body mt-2 max-w-lg">
                          {encounter.summary}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Action menu */}
                  <div className="relative">
                    <button
                      onClick={() =>
                        setMenuOpen(
                          menuOpen === encounter.id ? null : encounter.id,
                        )
                      }
                      className="p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors cursor-pointer"
                    >
                      <MoreVertical className="size-4" />
                    </button>
                    {menuOpen === encounter.id && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setMenuOpen(null)}
                        />
                        <div className="absolute right-0 top-8 z-20 w-36 bg-white border border-neutral-200 py-1">
                          <button
                            onClick={() => {
                              modal.show(<AddEncounterModal encounter={encounter} />);
                              setMenuOpen(null);
                            }}
                            className="w-full px-3 py-2 text-left text-[12px] font-body text-neutral-700 hover:bg-neutral-50 transition-colors flex items-center gap-2 cursor-pointer"
                          >
                            <Pencil className="size-3.5" />
                            编辑
                          </button>
                          <button
                            onClick={() => {
                              deleteMutation.mutate({ id: encounter.id });
                              setMenuOpen(null);
                            }}
                            className="w-full px-3 py-2 text-left text-[12px] font-body text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2 cursor-pointer"
                          >
                            <Trash2 className="size-3.5" />
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <ModuleImports target="encounter" />
    </div>
  );
}
