export const DataCategory = {
  LabResult: 'lab_result',
  VitalSign: 'vital_sign',
  Medication: 'medication',
  Condition: 'condition',
  Encounter: 'encounter',
  Imaging: 'imaging',
  Dental: 'dental',
  Immunization: 'immunization',
  Allergy: 'allergy',
  Procedure: 'procedure',
  SocialHistory: 'social_history',
  FamilyHistory: 'family_history',
  Wearable: 'wearable',
} as const;

export type DataCategory = (typeof DataCategory)[keyof typeof DataCategory];

export const DATA_CATEGORIES: DataCategory[] = Object.values(DataCategory);

export const CATEGORY_LABELS: Record<DataCategory, string> = {
  [DataCategory.LabResult]: 'Lab Results',
  [DataCategory.VitalSign]: 'Vital Signs',
  [DataCategory.Medication]: 'Medications',
  [DataCategory.Condition]: 'Conditions',
  [DataCategory.Encounter]: 'Encounters',
  [DataCategory.Imaging]: 'Imaging',
  [DataCategory.Dental]: 'Dental',
  [DataCategory.Immunization]: 'Immunizations',
  [DataCategory.Allergy]: 'Allergies',
  [DataCategory.Procedure]: 'Procedures',
  [DataCategory.SocialHistory]: 'Social History',
  [DataCategory.FamilyHistory]: 'Family History',
  [DataCategory.Wearable]: 'Wearable Data',
};

export const CATEGORY_GROUPS: Record<string, DataCategory[]> = {
  Clinical: [
    DataCategory.LabResult,
    DataCategory.VitalSign,
    DataCategory.Medication,
    DataCategory.Condition,
    DataCategory.Encounter,
    DataCategory.Imaging,
    DataCategory.Dental,
    DataCategory.Immunization,
    DataCategory.Allergy,
    DataCategory.Procedure,
  ],
  Lifestyle: [
    DataCategory.Wearable,
  ],
  History: [
    DataCategory.SocialHistory,
    DataCategory.FamilyHistory,
  ],
};
