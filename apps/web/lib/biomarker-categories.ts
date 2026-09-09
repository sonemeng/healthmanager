import type { LucideIcon } from "lucide-react";
import {
  Dna,
  Droplets,
  Beaker,
  Bug,
  FlaskConical,
  Sun,
  LoaderPinwheel,
  Bean,
  Syringe,
  Flame,
  HeartPulse,
  TestTubes,
  BarChart3,
  Watch,
  Cross,
} from "lucide-react";

export interface CategoryMeta {
  label: string;
  icon: LucideIcon;
}

export const CATEGORY_META: Record<string, CategoryMeta> = {
  metabolic: { label: "代谢", icon: Dna },
  hematology: { label: "血常规", icon: Droplets },
  hormone: { label: "激素", icon: Syringe },
  lipid: { label: "血脂", icon: Beaker },
  vital_sign: { label: "生命体征", icon: BarChart3 },
  vitamin: { label: "维生素", icon: Sun },
  thyroid: { label: "甲状腺", icon: Bug },
  inflammation: { label: "炎症", icon: Flame },
  iron_study: { label: "铁代谢", icon: FlaskConical },
  renal: { label: "肾功能", icon: Bean },
  cardiac: { label: "心脏", icon: HeartPulse },
  tumor_marker: { label: "肿瘤标志物", icon: Cross },
  wearable: { label: "可穿戴设备", icon: Watch },
  urinalysis: { label: "尿液检查", icon: TestTubes },
  hepatic: { label: "肝功能", icon: LoaderPinwheel },
};

export const CATEGORY_ORDER = [
  "metabolic",
  "hematology",
  "hormone",
  "lipid",
  "vital_sign",
  "vitamin",
  "thyroid",
  "inflammation",
  "iron_study",
  "renal",
  "cardiac",
  "tumor_marker",
  "wearable",
  "urinalysis",
  "hepatic",
] as const;
