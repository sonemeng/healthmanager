'use client';

import { StepLayout } from '../components/step-layout';
import { StepButtons } from '../components/step-buttons';
import { SearchableChecklist } from '../components/searchable-checklist';

export const medicalHistoryConditions = [
  // Cardiovascular
  { id: 'hypertension', label: '高血压', category: '心血管' },
  { id: 'heart_disease', label: 'Heart disease / CAD', category: '心血管' },
  { id: 'high_cholesterol', label: '高胆固醇血症', category: '心血管' },
  { id: 'atrial_fib', label: '心房颤动', category: '心血管' },
  { id: 'stroke', label: 'Stroke / TIA', category: '心血管' },
  { id: 'blood_clots', label: 'Blood clots / DVT', category: '心血管' },
  // Endocrine
  { id: 'diabetes_1', label: 'Type 1 diabetes', category: '内分泌' },
  { id: 'diabetes_2', label: 'Type 2 diabetes', category: '内分泌' },
  { id: 'prediabetes', label: '糖尿病前期', category: '内分泌' },
  { id: 'hypothyroid', label: '甲状腺功能减退', category: '内分泌' },
  { id: 'hyperthyroid', label: '甲状腺功能亢进', category: '内分泌' },
  { id: 'pcos', label: 'PCOS', category: '内分泌' },
  // Respiratory
  { id: 'asthma', label: '哮喘', category: '呼吸系统' },
  { id: 'copd', label: 'COPD', category: '呼吸系统' },
  { id: 'sleep_apnea', label: '睡眠呼吸暂停', category: '呼吸系统' },
  // Gastrointestinal
  { id: 'gerd', label: 'GERD / acid reflux', category: '消化系统' },
  { id: 'ibs', label: '肠易激综合征', category: '消化系统' },
  { id: 'crohns', label: '克罗恩病', category: '消化系统' },
  { id: 'celiac', label: '乳糜泻', category: '消化系统' },
  { id: 'liver_disease', label: '肝病', category: '消化系统' },
  // Mental health
  { id: 'depression', label: 'Depression', category: '精神心理' },
  { id: 'anxiety', label: '焦虑症', category: '精神心理' },
  { id: 'bipolar', label: '双相情感障碍', category: '精神心理' },
  { id: 'adhd', label: 'ADHD', category: '精神心理' },
  { id: 'ptsd', label: 'PTSD', category: '精神心理' },
  // Other
  { id: 'arthritis', label: '关节炎', category: '肌肉骨骼' },
  { id: 'osteoporosis', label: '骨质疏松', category: '肌肉骨骼' },
  { id: 'migraines', label: '偏头痛', category: '神经系统' },
  { id: 'epilepsy', label: 'Epilepsy', category: '神经系统' },
  { id: 'kidney_disease', label: '肾病', category: 'Other' },
  { id: 'anemia', label: '贫血', category: 'Other' },
  { id: 'cancer', label: 'Cancer (any type)', category: 'Other' },
  { id: 'autoimmune', label: '自身免疫疾病', category: 'Other' },
];

interface MedicalHistoryData {
  conditions: string[];
}

interface MedicalHistoryStepProps {
  data: MedicalHistoryData;
  onChange: (data: MedicalHistoryData) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  direction: 1 | -1;
}

export function MedicalHistoryStep({ data, onChange, onNext, onBack, onSkip, direction }: MedicalHistoryStepProps) {
  const toggle = (id: string) => {
    const next = data.conditions.includes(id)
      ? data.conditions.filter((c) => c !== id)
      : [...data.conditions, id];
    onChange({ conditions: next });
  };

  return (
    <StepLayout
      stepKey="medical-history"
      direction={direction}
      title="病史"
      subtitle="选择你曾被诊断过的疾病（含既往）。"
      why="为什么？了解病史有助于提供相关检验洞察并提示药物相互作用。"
      wide
      footer={
        <StepButtons
          onNext={onNext}
          onBack={onBack}
          onSkip={onSkip}
          showSkip
        />
      }
    >
      <SearchableChecklist
        items={medicalHistoryConditions}
        selected={data.conditions}
        onToggle={toggle}
        placeholder="搜索疾病…"
        maxHeight="360px"
      />
    </StepLayout>
  );
}

export type { MedicalHistoryData };
