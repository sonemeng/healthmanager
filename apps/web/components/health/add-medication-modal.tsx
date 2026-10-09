'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { Template } from '@/components/modal/template';
import { Button } from '@/components/button';
import { useModal } from '@/components/modal/provider';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import { ModuleImportButton } from './module-import-button';

const inputClass =
  'w-full border border-neutral-200 bg-white px-3 py-2.5 text-[14px] text-neutral-900 placeholder:text-neutral-400 focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100 transition-all';

const labelClass = 'block text-[13px] font-medium text-neutral-700 mb-1.5 font-display';

const categories = [
  { value: 'prescription', label: '处方药' },
  { value: 'supplement', label: '补剂' },
  { value: 'otc', label: 'OTC' },
] as const;

type Category = (typeof categories)[number]['value'];

// 编辑模式入参：medications.list 返回行的子集（结构兼容整行）
export type EditableMedication = {
  id: string;
  name: string;
  genericName: string | null;
  category: string | null;
  dosage: string | null;
  frequency: string | null;
  route: string | null;
  prescriber: string | null;
  indication: string | null;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean | null;
  notes: string | null;
};

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function AddMedicationModal({ medication }: { medication?: EditableMedication }) {
  const modal = useModal();
  const utils = trpc.useUtils();

  const isEdit = Boolean(medication);
  const [name, setName] = useState(medication?.name ?? '');
  const [category, setCategory] = useState<Category>(
    categories.some((cat) => cat.value === medication?.category)
      ? (medication!.category as Category)
      : 'prescription',
  );
  const [dosage, setDosage] = useState(medication?.dosage ?? '');
  const [frequency, setFrequency] = useState(medication?.frequency ?? '');
  const [route, setRoute] = useState(medication?.route ?? '');
  const [prescriber, setPrescriber] = useState(medication?.prescriber ?? '');
  const [indication, setIndication] = useState(medication?.indication ?? '');
  const [startDate, setStartDate] = useState(medication?.startDate ?? '');
  const [notes, setNotes] = useState(medication?.notes ?? '');
  const [showNotes, setShowNotes] = useState(Boolean(medication?.notes?.trim()));

  // 编辑模式：用药状态与分段记录
  const [isActive, setIsActive] = useState(medication?.isActive ?? true);
  const [endDate, setEndDate] = useState(medication?.endDate ?? '');
  const [changeMode, setChangeMode] = useState<'correct' | 'newStage'>('correct');
  const [changeDate, setChangeDate] = useState(todayIso());

  const createMutation = trpc.medications.create.useMutation({
    onSuccess: () => {
      utils.medications.list.invalidate();
      modal.hide();
    },
  });
  const updateMutation = trpc.medications.update.useMutation({
    onSuccess: () => {
      utils.medications.list.invalidate();
      modal.hide();
    },
  });
  const recordChangeMutation = trpc.medications.recordChange.useMutation({
    onSuccess: () => {
      utils.medications.list.invalidate();
      modal.hide();
    },
  });

  // 原本在用、仍保持停用状态不变，且用量/频次有改动 → 提供分段选择
  const wasActive = Boolean(medication?.isActive);
  const dosageChanged = (dosage.trim() || null) !== (medication?.dosage ?? null);
  const frequencyChanged = (frequency.trim() || null) !== (medication?.frequency ?? null);
  const showChangeChoice = isEdit && wasActive && isActive && (dosageChanged || frequencyChanged);

  const isSubmitting =
    createMutation.isPending || updateMutation.isPending || recordChangeMutation.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    if (isEdit && medication) {
      // 用量变化 → 新阶段：旧段自动停用（end_date=变更日），新开一段保留历史
      if (showChangeChoice && changeMode === 'newStage') {
        if (!changeDate) return;
        recordChangeMutation.mutate({
          id: medication.id,
          dosage: dosage.trim(),
          frequency: frequency.trim(),
          indication: indication.trim(),
          notes: notes.trim(),
          changeDate: new Date(changeDate),
        });
        return;
      }
      updateMutation.mutate({
        id: medication.id,
        name: name.trim(),
        category,
        dosage: dosage.trim(),
        frequency: frequency.trim(),
        route: route.trim(),
        prescriber: prescriber.trim(),
        indication: indication.trim(),
        startDate: startDate ? new Date(startDate) : null,
        isActive,
        endDate: isActive ? null : endDate ? new Date(endDate) : null,
        notes: notes.trim(),
      });
      return;
    }

    createMutation.mutate({
      name: name.trim(),
      category,
      dosage: dosage.trim() || undefined,
      frequency: frequency.trim() || undefined,
      route: route.trim() || undefined,
      prescriber: prescriber.trim() || undefined,
      indication: indication.trim() || undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      notes: notes.trim() || undefined,
    });
  }

  const fieldDelay = 0.03;

  return (
    <Template
      title={isEdit ? '编辑药物' : '添加药物'}
      description={isEdit ? '修改用药信息，或记录用药变化。' : '添加药物、补剂或非处方药。'}
      footer={
        <div className="flex flex-1 items-center justify-between gap-x-3">
          <Button onClick={() => modal.hide()} variant="ghost" text="取消" />
          <Button
            onClick={handleSubmit}
            text={isEdit ? '保存修改' : '添加药物'}
            loading={isSubmitting}
            disabled={!name.trim() || (isEdit && showChangeChoice && changeMode === 'newStage' && !changeDate)}
          />
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {!isEdit && (
          <div className="rounded-lg border border-dashed border-accent-200 bg-accent-50/40 p-3">
            <p className="text-[13px] font-medium text-neutral-800">从处方或用药单导入</p>
            <p className="mt-1 text-[11px] text-neutral-500">点击选择，或将图片/PDF 直接拖到按钮上。解析后需人工确认才会写入。</p>
            <div className="mt-2"><ModuleImportButton documentType="encounter_note" importTarget="medication" label="导入图片 / PDF" /></div>
          </div>
        )}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: fieldDelay * 0 }}
        >
          <label className={labelClass}>
            Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            className={inputClass}
            placeholder="如：氨氯地平"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: fieldDelay * 1 }}
        >
          <label className={labelClass}>Category</label>
          <div className="flex gap-1 border border-neutral-200 bg-neutral-50 p-1">
            {categories.map((cat) => (
              <button
                key={cat.value}
                type="button"
                onClick={() => setCategory(cat.value)}
                className={cn(
                  'flex-1 px-3 py-1.5 text-[13px] font-medium transition-all',
                  category === cat.value
                    ? 'bg-white text-neutral-900'
                    : 'text-neutral-500 hover:text-neutral-700',
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: fieldDelay * 2 }}
          className="grid grid-cols-2 gap-3"
        >
          <div>
            <label className={labelClass}>Dosage</label>
            <input
              type="text"
              className={inputClass}
              placeholder="e.g. 10mg"
              value={dosage}
              onChange={(e) => setDosage(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Frequency</label>
            <input
              type="text"
              className={inputClass}
              placeholder="如：每日一次"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
            />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: fieldDelay * 3 }}
          className="grid grid-cols-2 gap-3"
        >
          <div>
            <label className={labelClass}>Route</label>
            <input
              type="text"
              className={inputClass}
              placeholder="如：口服"
              value={route}
              onChange={(e) => setRoute(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Prescriber</label>
            <input
              type="text"
              className={inputClass}
              placeholder="如：张医生"
              value={prescriber}
              onChange={(e) => setPrescriber(e.target.value)}
            />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: fieldDelay * 4 }}
        >
          <label className={labelClass}>Indication</label>
          <textarea
            className={cn(inputClass, 'resize-none')}
            rows={2}
            placeholder="如：控制血压"
            value={indication}
            onChange={(e) => setIndication(e.target.value)}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: fieldDelay * 5 }}
        >
          <label className={labelClass}>Start date</label>
          <input
            type="date"
            className={inputClass}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </motion.div>

        {/* 编辑模式：用药状态 + 用量变化的分段选择 */}
        {isEdit && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: fieldDelay * 6 }}
            className="space-y-3 rounded-lg border border-neutral-200 bg-neutral-50/60 p-3"
          >
            <div>
              <label className={labelClass}>用药状态</label>
              <div className="flex gap-1 border border-neutral-200 bg-white p-1">
                <button
                  type="button"
                  onClick={() => setIsActive(true)}
                  className={cn(
                    'flex-1 px-3 py-1.5 text-[13px] font-medium transition-all',
                    isActive ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-700',
                  )}
                >
                  在用
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsActive(false);
                    if (!endDate) setEndDate(todayIso());
                  }}
                  className={cn(
                    'flex-1 px-3 py-1.5 text-[13px] font-medium transition-all',
                    !isActive ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-700',
                  )}
                >
                  已停用
                </button>
              </div>
            </div>
            {!isActive && (
              <div>
                <label className={labelClass}>停用日期</label>
                <input
                  type="date"
                  className={inputClass}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            )}
            {showChangeChoice && (
              <div className="border-t border-neutral-200 pt-3">
                <p className="text-[13px] font-medium text-neutral-800">用量或频次有变化</p>
                <p className="mt-0.5 text-[11px] text-neutral-500">
                  选择「新阶段」会保留旧的用药记录作为历史，便于复诊时回顾用药变化。
                </p>
                <div className="mt-2 space-y-1.5">
                  {([
                    { value: 'correct', label: '仅修正本记录（原来录错了）' },
                    { value: 'newStage', label: '记录为新阶段（保留历史）' },
                  ] as const).map((opt) => (
                    <label
                      key={opt.value}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-[13px] transition-colors',
                        changeMode === opt.value
                          ? 'border-accent-400 bg-white text-neutral-900'
                          : 'border-neutral-200 bg-white/60 text-neutral-500 hover:border-neutral-300',
                      )}
                    >
                      <input
                        type="radio"
                        name="change-mode"
                        className="accent-accent-600"
                        checked={changeMode === opt.value}
                        onChange={() => setChangeMode(opt.value)}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
                {changeMode === 'newStage' && (
                  <div className="mt-2">
                    <label className={labelClass}>
                      变更日期 <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="date"
                      className={inputClass}
                      value={changeDate}
                      onChange={(e) => setChangeDate(e.target.value)}
                    />
                    <p className="mt-1 text-[11px] text-neutral-400">
                      旧记录将停用至该日，新记录从该日开始。
                    </p>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: fieldDelay * 7 }}
        >
          {!showNotes ? (
            <button
              type="button"
              onClick={() => setShowNotes(true)}
              className="flex items-center gap-1 text-[13px] text-neutral-500 hover:text-neutral-700 transition-colors"
            >
              <ChevronDown className="h-3.5 w-3.5" />
              Add notes
            </button>
          ) : (
            <div>
              <label className={labelClass}>Notes</label>
              <textarea
                className={cn(inputClass, 'resize-none')}
                rows={3}
                placeholder="补充备注…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                autoFocus
              />
            </div>
          )}
        </motion.div>
      </form>
    </Template>
  );
}
