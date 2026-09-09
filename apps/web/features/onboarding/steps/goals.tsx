'use client';

import { cn } from '@/lib/utils';
import { StepLayout } from '../components/step-layout';
import { StepButtons } from '../components/step-buttons';
import { Check } from 'lucide-react';

interface GoalsData {
  reasons: string[];
  priorities: string[];
  wearables: string[];
}

interface GoalsStepProps {
  data: GoalsData;
  onChange: (data: GoalsData) => void;
  onNext: () => void;
  onBack: () => void;
  direction: 1 | -1;
}

const reasons = [
  { id: 'understand_labs', label: '看懂我的检验结果', icon: '◎' },
  { id: 'track_conditions', label: '管理慢性病', icon: '⊡' },
  { id: 'track_meds', label: '追踪用药与依从性', icon: '◉' },
  { id: 'share_providers', label: '与医生共享数据', icon: '⊞' },
  { id: 'preventive', label: '做好预防保健', icon: '⊟' },
  { id: 'family_risk', label: '了解家族健康风险', icon: '↔' },
  { id: 'ai_insights', label: '获取 AI 健康洞察', icon: '◆' },
  { id: 'own_data', label: '拥有并掌控自己的健康数据', icon: '✓' },
  { id: 'fitness', label: '改善健身与营养', icon: '↑' },
  { id: 'weight', label: '管理体重', icon: '⚖' },
];

const wearableOptions = [
  'Apple Watch', 'Fitbit', 'Oura Ring', 'Garmin', 'Whoop', 'CGM (Dexcom/Libre)', 'Withings', 'None',
];

function ChipToggle({ label, icon, selected, onClick }: { label: string; icon?: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 border px-3.5 py-2.5 text-[13px] font-medium transition-all cursor-pointer text-left',
        selected
          ? 'border-accent-500 bg-accent-50 text-accent-700'
          : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50'
      )}
    >
      {icon && (
        <span className="text-[14px] opacity-70 font-mono">{icon}</span>
      )}
      <span className="flex-1">{label}</span>
      {selected && <Check className="size-3.5 text-accent-500 shrink-0" />}
    </button>
  );
}

export function GoalsStep({ data, onChange, onNext, onBack, direction }: GoalsStepProps) {
  const toggleReason = (id: string) => {
    const next = data.reasons.includes(id)
      ? data.reasons.filter((r) => r !== id)
      : [...data.reasons, id];
    onChange({ ...data, reasons: next });
  };

  const toggleWearable = (w: string) => {
    const next = data.wearables.includes(w)
      ? data.wearables.filter((x) => x !== w)
      : [...data.wearables, w];
    onChange({ ...data, wearables: next });
  };

  return (
    <StepLayout
      stepKey="goals"
      direction={direction}
      title="你使用 HealthManager++ 的目标是什么？"
      subtitle="选择所有符合的项，我们会据此定制你的工作台与建议。"
      why="为什么？我们会根据你的目标优先展示相应功能与洞察。"
      wide
      footer={
        <StepButtons
          onNext={onNext}
          onBack={onBack}
          nextDisabled={data.reasons.length === 0}
        />
      }
    >
      <div className="space-y-6">
        {/* Reasons */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {reasons.map((r) => (
            <ChipToggle
              key={r.id}
              label={r.label}
              icon={r.icon}
              selected={data.reasons.includes(r.id)}
              onClick={() => toggleReason(r.id)}
            />
          ))}
        </div>

        {/* Wearables */}
        <div>
          <label
            className="block text-[13px] font-medium text-neutral-700 mb-2 font-body"
          >
            Do you use any wearable devices? <span className="text-neutral-400 font-normal">(optional)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {wearableOptions.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => toggleWearable(w)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-[12px] font-medium transition-all cursor-pointer',
                  data.wearables.includes(w)
                    ? 'border-accent-500 bg-accent-50 text-accent-700'
                    : 'border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300'
                )}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
      </div>
    </StepLayout>
  );
}

export type { GoalsData };
