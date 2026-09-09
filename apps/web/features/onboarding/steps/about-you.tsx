'use client';

import { StepLayout } from '../components/step-layout';
import { StepButtons } from '../components/step-buttons';

interface AboutYouData {
  firstName: string;
  lastName: string;
  dob: string;
  sex: string;
  heightCm: string;
  weightJin: string;
  bloodType: string;
}

interface AboutYouStepProps {
  data: AboutYouData;
  onChange: (data: AboutYouData) => void;
  onNext: () => void;
  onBack: () => void;
  direction: 1 | -1;
}

const inputClass =
  'w-full border border-neutral-200 bg-white px-3 py-2.5 text-[14px] text-neutral-900 placeholder:text-neutral-400 focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100 transition-all';
const labelClass = 'block text-[13px] font-medium text-neutral-700 mb-1.5';
const selectClass =
  'w-full border border-neutral-200 bg-white px-3 py-2.5 text-[14px] text-neutral-900 focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100 transition-all appearance-none cursor-pointer';

export function AboutYouStep({ data, onChange, onNext, onBack, direction }: AboutYouStepProps) {
  const update = (field: keyof AboutYouData, value: string) => onChange({ ...data, [field]: value });
  const canContinue = data.firstName.trim() && data.lastName.trim() && data.dob;

  return (
    <StepLayout
      stepKey="about-you"
      direction={direction}
      title="关于你"
      subtitle="基本信息用于个性化参考区间和健康洞察。"
      why="为什么？你的年龄和生理性别决定了检验结果的临床基线。"
      footer={
        <StepButtons
          onNext={onNext}
          onBack={onBack}
          nextDisabled={!canContinue}
        />
      }
    >
      <div className="space-y-4">
        {/* Name */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>名字</label>
            <input type="text" value={data.firstName} onChange={(e) => update('firstName', e.target.value)} className={inputClass} placeholder="名字" />
          </div>
          <div>
            <label className={labelClass}>姓氏</label>
            <input type="text" value={data.lastName} onChange={(e) => update('lastName', e.target.value)} className={inputClass} placeholder="姓氏" />
          </div>
        </div>

        {/* DOB */}
        <div>
          <label className={labelClass}>出生日期</label>
          <input type="date" value={data.dob} onChange={(e) => update('dob', e.target.value)} className={inputClass} />
        </div>

        {/* Biological sex */}
        <div>
          <label className={labelClass}>生理性别</label>
          <div className="grid grid-cols-3 gap-2">
            {[['male', '男'], ['female', '女'], ['intersex', '间性']].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => update('sex', value!)}
                className={`border px-3 py-2.5 text-[13px] font-medium transition-all cursor-pointer ${
                  data.sex === value
                    ? 'border-accent-500 bg-accent-50 text-accent-700'
                    : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Height + Weight（国人单位：厘米 + 斤） */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>身高</label>
            <div className="relative">
              <input type="number" value={data.heightCm} onChange={(e) => update('heightCm', e.target.value)} className={inputClass + ' pr-10'} placeholder="170" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-neutral-400 font-mono">厘米</span>
            </div>
          </div>
          <div>
            <label className={labelClass}>体重</label>
            <div className="relative">
              <input type="number" value={data.weightJin} onChange={(e) => update('weightJin', e.target.value)} className={inputClass + ' pr-10'} placeholder="130" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-neutral-400 font-mono">斤</span>
            </div>
          </div>
        </div>

        {/* Blood type */}
        <div>
          <label className={labelClass}>
            血型 <span className="text-neutral-400 font-normal">（选填）</span>
          </label>
          <div className="grid grid-cols-4 gap-2">
            {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((bt) => (
              <button
                key={bt}
                type="button"
                onClick={() => update('bloodType', data.bloodType === bt ? '' : bt)}
                className={`border px-2 py-2 text-[12px] font-semibold transition-all cursor-pointer ${
                  data.bloodType === bt
                    ? 'border-accent-500 bg-accent-50 text-accent-700'
                    : 'border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300'
                }`}
              >
                {bt}
              </button>
            ))}
          </div>
        </div>
      </div>
    </StepLayout>
  );
}

export type { AboutYouData };
