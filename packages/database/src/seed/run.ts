import { getDb } from "../client";
import {
  metricDefinitions,
  unitConversions,
  referenceRanges,
  optimalRanges,
} from "../schema/metrics";
import { shareTemplates } from "../schema/sharing";
import {
  labProviders,
  panelTemplates,
  panelTemplateMetrics,
} from "../schema/testing";
import { metricDefinitionSeeds } from "./data/metric-definitions";
import { metricDefinitionsBefore0018 } from "../bootstrap/legacy-schema";
import { CHINA_DICT_OVERRIDES } from "./data/china-overrides";
import { referenceRangeSeeds } from "./data/reference-ranges";
import { optimalRangeSeeds } from "./data/optimal-ranges";
import { labProviderSeeds } from "./data/lab-providers";
import {
  panelTemplateSeeds,
  panelTemplateMetricSeeds,
} from "./data/panel-templates";

async function main() {
  const db = getDb();

  // 新装引导分相（07 号坑 19/20，v0.1.27）：空库全量迁移时 0018 的 reference_ranges
  // INSERT 会撞 metric_definitions 外键，所以主程序会在 0018 之前先跑本模式——
  // 只灌字典（外键的爹），区间等其余数据交给 0018 迁移与末尾的完整 seed。
  // 顺序编排见 packages/database/src/bootstrap/plan.ts。
  const dictionaryOnly = process.argv.includes("--dictionary-only");

  console.log("Seeding metric definitions...");
  // 字典中国化覆盖（spec 19）：与迁移 0018 的 UPDATE VALUES 同口径——
  // seed 只管新装机，存量库靠迁移；两处数值必须逐条一致（单一底册：19-附录）。
  const metricSeeds = metricDefinitionSeeds.map((m) => {
    const override = CHINA_DICT_OVERRIDES[m.id];
    return override ? { ...m, ...override } : m;
  });
  await db
    .insert(dictionaryOnly ? metricDefinitionsBefore0018 : metricDefinitions)
    .values(metricSeeds)
    .onConflictDoNothing();

  if (dictionaryOnly) {
    console.log("Dictionary seed completed (dictionary-only): metric_definitions only.");
    return;
  }

  console.log("Seeding reference ranges...");
  await db
    .insert(referenceRanges)
    .values(referenceRangeSeeds)
    .onConflictDoNothing();

  console.log("Seeding optimal ranges...");
  await db
    .insert(optimalRanges)
    .values(optimalRangeSeeds)
    .onConflictDoNothing();

  console.log("Seeding unit conversions...");
  await db
    .insert(unitConversions)
    .values([
      {
        fromUnit: "mg/dL",
        toUnit: "mmol/L",
        metricCode: "glucose",
        multiplier: 0.0555,
        offset: 0,
      },
      {
        fromUnit: "mmol/L",
        toUnit: "mg/dL",
        metricCode: "glucose",
        multiplier: 18.018,
        offset: 0,
      },
      {
        fromUnit: "mg/dL",
        toUnit: "mmol/L",
        metricCode: "cholesterol_total",
        multiplier: 0.0259,
        offset: 0,
      },
      {
        fromUnit: "mmol/L",
        toUnit: "mg/dL",
        metricCode: "cholesterol_total",
        multiplier: 38.61,
        offset: 0,
      },
      {
        fromUnit: "mg/dL",
        toUnit: "mmol/L",
        metricCode: "triglycerides",
        multiplier: 0.0113,
        offset: 0,
      },
      {
        fromUnit: "mmol/L",
        toUnit: "mg/dL",
        metricCode: "triglycerides",
        multiplier: 88.57,
        offset: 0,
      },
      {
        fromUnit: "mg/dL",
        toUnit: "mmol/L",
        metricCode: "hdl_cholesterol",
        multiplier: 0.0259,
        offset: 0,
      },
      {
        fromUnit: "mmol/L",
        toUnit: "mg/dL",
        metricCode: "hdl_cholesterol",
        multiplier: 38.61,
        offset: 0,
      },
      {
        fromUnit: "mg/dL",
        toUnit: "mmol/L",
        metricCode: "ldl_cholesterol",
        multiplier: 0.0259,
        offset: 0,
      },
      {
        fromUnit: "mmol/L",
        toUnit: "mg/dL",
        metricCode: "ldl_cholesterol",
        multiplier: 38.61,
        offset: 0,
      },
      {
        fromUnit: "mg/dL",
        toUnit: "umol/L",
        metricCode: "creatinine",
        multiplier: 88.4,
        offset: 0,
      },
      {
        fromUnit: "μmol/L",
        toUnit: "mg/dL",
        metricCode: "creatinine",
        multiplier: 0.01131,
        offset: 0,
      },
      {
        fromUnit: "umol/L",
        toUnit: "mg/dL",
        metricCode: "creatinine",
        multiplier: 0.01131,
        offset: 0,
      },
      {
        fromUnit: "mg/dL",
        toUnit: "umol/L",
        metricCode: "uric_acid",
        multiplier: 59.48,
        offset: 0,
      },
      {
        fromUnit: "μmol/L",
        toUnit: "mg/dL",
        metricCode: "uric_acid",
        multiplier: 0.01681,
        offset: 0,
      },
      {
        fromUnit: "umol/L",
        toUnit: "mg/dL",
        metricCode: "uric_acid",
        multiplier: 0.01681,
        offset: 0,
      },
      {
        fromUnit: "mmol/L",
        toUnit: "mg/dL",
        metricCode: "bun",
        multiplier: 2.801,
        offset: 0,
      },
      {
        fromUnit: "mmol/L",
        toUnit: "mg/dL",
        metricCode: "calcium",
        multiplier: 4.008,
        offset: 0,
      },
      {
        fromUnit: "lb",
        toUnit: "kg",
        metricCode: null,
        multiplier: 0.4536,
        offset: 0,
      },
      {
        fromUnit: "in",
        toUnit: "cm",
        metricCode: null,
        multiplier: 2.54,
        offset: 0,
      },
      {
        fromUnit: "F",
        toUnit: "C",
        metricCode: null,
        multiplier: 0.5556,
        offset: -17.7778,
      },
    ])
    .onConflictDoNothing();

  console.log("Seeding share templates...");
  await db
    .insert(shareTemplates)
    .values([
      {
        id: "clinician",
        name: "Clinician",
        description: "Full clinical data sharing for your doctor or specialist",
        categories: [
          "lab_result",
          "vital_sign",
          "medication",
          "condition",
          "encounter",
          "imaging",
          "dental",
          "wearable",
        ],
        defaultAccessLevel: "view_download",
        sortOrder: 1,
      },
      {
        id: "nutritionist",
        name: "Nutritionist",
        description:
          "Lab results, vitals, and medications for dietary guidance",
        categories: ["lab_result", "vital_sign", "medication"],
        defaultAccessLevel: "view",
        sortOrder: 2,
      },
      {
        id: "fitness_coach",
        name: "Fitness Coach",
        description: "Vital signs and wearable data for training optimization",
        categories: ["vital_sign", "wearable"],
        defaultAccessLevel: "view",
        sortOrder: 3,
      },
      {
        id: "family",
        name: "Family Member",
        description: "Key health information for a trusted family member",
        categories: ["lab_result", "vital_sign", "medication", "condition"],
        defaultAccessLevel: "view",
        sortOrder: 4,
      },
      {
        id: "dental",
        name: "Dental Provider",
        description: "Dental and encounter records for your dentist",
        categories: ["dental", "encounter"],
        defaultAccessLevel: "view",
        sortOrder: 5,
      },
    ])
    .onConflictDoNothing();

  console.log("Seeding lab providers...");
  await db.insert(labProviders).values(labProviderSeeds).onConflictDoNothing();

  console.log("Seeding panel templates...");
  await db
    .insert(panelTemplates)
    .values(panelTemplateSeeds)
    .onConflictDoNothing();

  console.log("Seeding panel template metrics...");
  await db
    .insert(panelTemplateMetrics)
    .values(panelTemplateMetricSeeds)
    .onConflictDoNothing();

  console.log("Seed completed successfully.");
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
