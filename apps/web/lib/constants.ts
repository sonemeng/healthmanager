import type { HealthStatus } from "@/components/health/status-badge";

export const DOC_TYPE_LABELS: Record<string, string> = {
  lab_report: "化验报告",
  encounter_note: "就诊记录",
  imaging_report: "影像报告",
  dental_record: "牙科记录",
  immunization_record: "免疫接种记录",
  csv_export: "CSV 导入",
  wearable_export: "可穿戴设备导出",
  apple_health_export: "Apple Health 导出",
  unknown: "未知类型",
};

export const IMPORT_JOB_STATUS_MAP: Record<
  string,
  { label: string; badge: HealthStatus }
> = {
  completed: { label: "已完成", badge: "normal" },
  pending: { label: "等待中", badge: "info" },
  classifying: { label: "分类中", badge: "info" },
  parsing: { label: "解析中…", badge: "info" },
  normalizing: { label: "归一化中", badge: "info" },
  review_needed: { label: "待人工确认", badge: "warning" },
  failed: { label: "失败", badge: "critical" },
};
