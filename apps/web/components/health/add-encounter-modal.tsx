'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { Template } from '@/components/modal/template';
import { Button } from '@/components/button';
import { useModal } from '@/components/modal/provider';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';
import { ModuleImportButton } from './module-import-button';

const inputClass =
  'w-full border border-neutral-200 bg-white px-3 py-2.5 text-[14px] text-neutral-900 placeholder:text-neutral-400 focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100 transition-all';

const labelClass = 'block text-[13px] font-medium text-neutral-700 mb-1.5 font-display';

const encounterTypes = [
  { value: 'checkup', label: '体检' },
  { value: 'specialist', label: '专科门诊' },
  { value: 'urgent_care', label: '急诊护理' },
  { value: 'emergency', label: '急诊' },
  { value: 'telehealth', label: '远程医疗' },
  { value: 'lab_visit', label: '化验检查' },
  { value: 'imaging', label: '影像检查' },
  { value: 'dental', label: '牙科' },
  { value: 'therapy', label: '治疗门诊' },
  { value: 'other', label: '其他' },
] as const;

type EncounterType = (typeof encounterTypes)[number]['value'];

type Encounter = {
  id: string;
  type: string;
  provider: string | null;
  facility: string | null;
  encounterDate: string;
  chiefComplaint: string | null;
  summary: string | null;
};

export function AddEncounterModal({ encounter }: { encounter?: Encounter }) {
  const modal = useModal();
  const utils = trpc.useUtils();

  const [type, setType] = useState<EncounterType>(
    encounterTypes.some((item) => item.value === encounter?.type)
      ? encounter!.type as EncounterType
      : 'checkup',
  );
  const [provider, setProvider] = useState(encounter?.provider ?? '');
  const [facility, setFacility] = useState(encounter?.facility ?? '');
  const [encounterDate, setEncounterDate] = useState(encounter?.encounterDate ?? '');
  const [chiefComplaint, setChiefComplaint] = useState(encounter?.chiefComplaint ?? '');
  const [summary, setSummary] = useState(encounter?.summary ?? '');

  const createMutation = trpc.encounters.create.useMutation({
    onSuccess: () => {
      utils.encounters.list.invalidate();
      modal.hide();
    },
  });
  const updateMutation = trpc.encounters.update.useMutation({
    onSuccess: () => {
      utils.encounters.list.invalidate();
      modal.hide();
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!encounterDate) return;

    const values = {
      type,
      provider: provider.trim() || undefined,
      facility: facility.trim() || undefined,
      encounterDate,
      chiefComplaint: chiefComplaint.trim() || undefined,
      summary: summary.trim() || undefined,
    };
    if (encounter) updateMutation.mutate({ id: encounter.id, ...values });
    else createMutation.mutate(values);
  }

  const fieldDelay = 0.03;

  return (
    <Template
      title={encounter ? "编辑就诊" : "记录就诊"}
      description={encounter ? "修改这次就诊记录。" : "记录一次就诊。"}
      footer={
        <div className="flex flex-1 items-center justify-between gap-x-3">
          <Button onClick={() => modal.hide()} variant="ghost" text="取消" />
          <Button
            onClick={handleSubmit}
            text={encounter ? "保存修改" : "记录就诊"}
            loading={createMutation.isPending || updateMutation.isPending}
            disabled={!encounterDate}
          />
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {!encounter && <div className="rounded-lg border border-dashed border-accent-200 bg-accent-50/40 p-3">
          <p className="text-[13px] font-medium text-neutral-800">从就诊资料导入</p>
          <p className="mt-1 text-[11px] text-neutral-500">点击选择，或将图片/PDF 直接拖到按钮上。只提取就诊候选，确认后才写入。</p>
          <div className="mt-2"><ModuleImportButton documentType="encounter_note" importTarget="encounter" label="导入图片 / PDF" /></div>
        </div>}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: fieldDelay * 0 }}
        >
          <label className={labelClass}>Type</label>
          <div className="grid grid-cols-3 gap-1 border border-neutral-200 bg-neutral-50 p-1">
            {encounterTypes.slice(0, 6).map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                className={cn(
                  'px-2 py-1.5 text-[12px] font-medium transition-all',
                  type === t.value
                    ? 'bg-white text-neutral-900'
                    : 'text-neutral-500 hover:text-neutral-700',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: fieldDelay * 1 }}
        >
          <label className={labelClass}>
            Date <span className="text-red-400">*</span>
          </label>
          <input
            type="date"
            className={inputClass}
            value={encounterDate}
            onChange={(e) => setEncounterDate(e.target.value)}
            autoFocus
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: fieldDelay * 2 }}
          className="grid grid-cols-2 gap-3"
        >
          <div>
            <label className={labelClass}>Provider</label>
            <input
              type="text"
              className={inputClass}
              placeholder="如：张医生"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Facility</label>
            <input
              type="text"
              className={inputClass}
              placeholder="如：市第一医院"
              value={facility}
              onChange={(e) => setFacility(e.target.value)}
            />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: fieldDelay * 3 }}
        >
          <label className={labelClass}>Reason for visit</label>
          <input
            type="text"
            className={inputClass}
            placeholder="如：年度体检"
            value={chiefComplaint}
            onChange={(e) => setChiefComplaint(e.target.value)}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: fieldDelay * 4 }}
        >
          <label className={labelClass}>Summary / Notes</label>
          <textarea
            className={cn(inputClass, 'resize-none')}
            rows={3}
            placeholder="主要发现、建议与下一步…"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
        </motion.div>
      </form>
    </Template>
  );
}
