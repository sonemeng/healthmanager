'use client';

import { cn } from '@/lib/utils';
import { StepLayout } from '../components/step-layout';
import { StepButtons } from '../components/step-buttons';

interface LifestyleData {
  smoking: string;
  alcohol: string;
  exerciseDays: string;
  exerciseType: string[];
  diet: string;
  sleepHours: string;
  stressLevel: string;
}

interface LifestyleStepProps {
  data: LifestyleData;
  onChange: (data: LifestyleData) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  direction: 1 | -1;
}

function OptionRow({ label, options, value, onSelect }: { label: string; options: { id: string; label: string }[]; value: string; onSelect: (id: string) => void }) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-neutral-700 mb-2 font-body">
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onSelect(o.id)}
            className={cn(
              'border px-3 py-2 text-[12px] font-medium transition-all cursor-pointer',
              value === o.id
                ? 'border-accent-500 bg-accent-50 text-accent-700'
                : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300'
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function LifestyleStep({ data, onChange, onNext, onBack, onSkip, direction }: LifestyleStepProps) {
  const update = (field: keyof LifestyleData, value: string | string[]) =>
    onChange({ ...data, [field]: value });

  const toggleExerciseType = (type: string) => {
    const next = data.exerciseType.includes(type)
      ? data.exerciseType.filter((t) => t !== type)
      : [...data.exerciseType, type];
    update('exerciseType', next);
  };

  return (
    <StepLayout
      stepKey="lifestyle"
      direction={direction}
      title="Lifestyle"
      subtitle="快速记录你的日常习惯。"
      why="为什么？生活方式是影响健康结果的最大因素。"
      wide
      footer={
        <StepButtons onNext={onNext} onBack={onBack} onSkip={onSkip} showSkip />
      }
    >
      <div className="space-y-5">
        <OptionRow
          label="吸烟情况"
          options={[
            { id: 'never', label: 'Never' },
            { id: '曾经吸烟', label: 'Former' },
            { id: 'current', label: '目前吸烟' },
          ]}
          value={data.smoking}
          onSelect={(v) => update('smoking', v)}
        />

        <OptionRow
          label="饮酒"
          options={[
            { id: 'none', label: 'None' },
            { id: '社交场合', label: 'Social (1–3/week)' },
            { id: '适量', label: 'Moderate (4–7/week)' },
            { id: 'heavy', label: 'Heavy (8+/week)' },
          ]}
          value={data.alcohol}
          onSelect={(v) => update('alcohol', v)}
        />

        <OptionRow
          label="运动频率"
          options={[
            { id: '0', label: 'None' },
            { id: '1-2', label: '1–2 days/week' },
            { id: '3-4', label: '3–4 days/week' },
            { id: '5+', label: '5+ days/week' },
          ]}
          value={data.exerciseDays}
          onSelect={(v) => update('exerciseDays', v)}
        />

        {data.exerciseDays && data.exerciseDays !== '0' && (
          <div>
            <label className="block text-[13px] font-medium text-neutral-700 mb-2 font-body">
              Exercise types
            </label>
            <div className="flex flex-wrap gap-2">
              {['有氧运动', '力量训练', 'Yoga/Flexibility', '球类运动', '散步', '游泳'].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleExerciseType(t)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-[12px] font-medium transition-all cursor-pointer',
                    data.exerciseType.includes(t)
                      ? 'border-accent-500 bg-accent-50 text-accent-700'
                      : 'border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300'
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        <OptionRow
          label="Diet"
          options={[
            { id: 'none', label: '无限制' },
            { id: 'vegetarian', label: '素食' },
            { id: 'vegan', label: 'Vegan' },
            { id: 'keto', label: 'Keto/Low-carb' },
            { id: '地中海饮食', label: 'Mediterranean' },
            { id: 'other', label: 'Other' },
          ]}
          value={data.diet}
          onSelect={(v) => update('diet', v)}
        />

        <OptionRow
          label="平均睡眠"
          options={[
            { id: '<5', label: '< 5 hours' },
            { id: '5-6', label: '5–6 hours' },
            { id: '6-7', label: '6–7 hours' },
            { id: '7-8', label: '7–8 hours' },
            { id: '9+', label: '9+ hours' },
          ]}
          value={data.sleepHours}
          onSelect={(v) => update('sleepHours', v)}
        />

        <OptionRow
          label="压力水平"
          options={[
            { id: 'low', label: 'Low' },
            { id: '适量', label: 'Moderate' },
            { id: 'high', label: 'High' },
          ]}
          value={data.stressLevel}
          onSelect={(v) => update('stressLevel', v)}
        />
      </div>
    </StepLayout>
  );
}

export type { LifestyleData };
