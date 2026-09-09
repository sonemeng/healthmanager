'use client';

import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';
import { StepLayout } from '../components/step-layout';
import { StepButtons } from '../components/step-buttons';

const familyMembers = ['母亲', '父亲', '兄弟姐妹', '祖父母'] as const;
const familyConditions = [
  '心脏病', '中风', '高血压', '糖尿病',
  '癌症', '抑郁症', 'Alzheimer\'肾病', '自身免疫疾病', '血栓',
] as const;

type FamilyMember = (typeof familyMembers)[number];

interface FamilyHistoryData {
  history: Record<string, string[]>;
}

interface FamilyHistoryStepProps {
  data: FamilyHistoryData;
  onChange: (data: FamilyHistoryData) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  direction: 1 | -1;
}

export function FamilyHistoryStep({ data, onChange, onNext, onBack, onSkip, direction }: FamilyHistoryStepProps) {
  const toggle = (member: string, condition: string) => {
    const current = data.history[member] ?? [];
    const next = current.includes(condition)
      ? current.filter((c) => c !== condition)
      : [...current, condition];
    onChange({ history: { ...data.history, [member]: next } });
  };

  const isSelected = (member: string, condition: string) =>
    (data.history[member] ?? []).includes(condition);

  return (
    <StepLayout
      stepKey="family-history"
      direction={direction}
      title="家族病史"
      subtitle="选择每位家庭成员患过的疾病。家族史是健康风险最强的预测因素之一。"
      why="为什么？家族史会影响参考区间的解读与风险评估。"
      wide
      footer={
        <StepButtons onNext={onNext} onBack={onBack} onSkip={onSkip} showSkip />
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="pb-2 pr-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-neutral-400 font-mono">
                Condition
              </th>
              {familyMembers.map((m) => (
                <th key={m} className="pb-2 px-2 text-center text-[11px] font-semibold uppercase tracking-[0.05em] text-neutral-400 font-mono">
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {familyConditions.map((condition) => (
              <tr key={condition} className="border-t border-neutral-100">
                <td className="py-2.5 pr-3 text-[13px] text-neutral-700 font-body">
                  {condition}
                </td>
                {familyMembers.map((member) => (
                  <td key={member} className="py-2.5 px-2 text-center">
                    <button
                      type="button"
                      onClick={() => toggle(member, condition)}
                      className={cn(
                        'mx-auto flex size-6 items-center justify-center rounded border transition-all cursor-pointer',
                        isSelected(member, condition)
                          ? 'border-accent-500 bg-accent-500'
                          : 'border-neutral-300 bg-white hover:border-neutral-400'
                      )}
                    >
                      {isSelected(member, condition) && (
                        <Check className="size-3 text-white" />
                      )}
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </StepLayout>
  );
}

export type { FamilyHistoryData };
