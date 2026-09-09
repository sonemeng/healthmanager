'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { Template } from '@/components/modal/template';
import { Button } from '@/components/button';
import { useModal } from '@/components/modal/provider';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';

const inputClass =
  'w-full border border-neutral-200 bg-white px-3 py-2.5 text-[14px] text-neutral-900 placeholder:text-neutral-400 focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100 transition-all';

const labelClass = 'block text-[13px] font-medium text-neutral-700 mb-1.5 font-display';

const severities = [
  { value: 'mild', label: 'Mild' },
  { value: 'moderate', label: '中度' },
  { value: 'severe', label: 'Severe' },
] as const;

type Severity = (typeof severities)[number]['value'];

export function AddConditionModal() {
  const modal = useModal();
  const utils = trpc.useUtils();

  const [name, setName] = useState('');
  const [severity, setSeverity] = useState<Severity | ''>('');
  const [status, setStatus] = useState<'active' | 'resolved'>('active');
  const [onsetDate, setOnsetDate] = useState('');
  const [resolutionDate, setResolutionDate] = useState('');
  const [diagnosedBy, setDiagnosedBy] = useState('');
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);

  const createMutation = trpc.conditions.create.useMutation({
    onSuccess: () => {
      utils.conditions.list.invalidate();
      modal.hide();
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    createMutation.mutate({
      name: name.trim(),
      severity: severity || undefined,
      status,
      onsetDate: onsetDate || undefined,
      resolutionDate: status === 'resolved' && resolutionDate ? resolutionDate : undefined,
      diagnosedBy: diagnosedBy.trim() || undefined,
      notes: notes.trim() || undefined,
    });
  }

  const fieldDelay = 0.03;

  return (
    <Template
      title="添加病史"
      description="记录健康状况或诊断。"
      footer={
        <div className="flex flex-1 items-center justify-between gap-x-3">
          <Button onClick={() => modal.hide()} variant="ghost" text="取消" />
          <Button
            onClick={handleSubmit}
            text="添加病史"
            loading={createMutation.isPending}
            disabled={!name.trim()}
          />
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: fieldDelay * 0 }}
        >
          <label className={labelClass}>
            Condition <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            className={inputClass}
            placeholder="e.g. Type 2 Diabetes"
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
          <label className={labelClass}>Status</label>
          <div className="flex gap-1 border border-neutral-200 bg-neutral-50 p-1">
            {(['active', 'resolved'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={cn(
                  'flex-1 px-3 py-1.5 text-[13px] font-medium transition-all capitalize',
                  status === s
                    ? 'bg-white text-neutral-900'
                    : 'text-neutral-500 hover:text-neutral-700',
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: fieldDelay * 2 }}
        >
          <label className={labelClass}>Severity</label>
          <div className="flex gap-1 border border-neutral-200 bg-neutral-50 p-1">
            {severities.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setSeverity(severity === s.value ? '' : s.value)}
                className={cn(
                  'flex-1 px-3 py-1.5 text-[13px] font-medium transition-all',
                  severity === s.value
                    ? 'bg-white text-neutral-900'
                    : 'text-neutral-500 hover:text-neutral-700',
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: fieldDelay * 3 }}
          className="grid grid-cols-2 gap-3"
        >
          <div>
            <label className={labelClass}>Onset date</label>
            <input
              type="date"
              className={inputClass}
              value={onsetDate}
              onChange={(e) => setOnsetDate(e.target.value)}
            />
          </div>
          {status === 'resolved' && (
            <div>
              <label className={labelClass}>Resolution date</label>
              <input
                type="date"
                className={inputClass}
                value={resolutionDate}
                onChange={(e) => setResolutionDate(e.target.value)}
              />
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: fieldDelay * 4 }}
        >
          <label className={labelClass}>Diagnosed by</label>
          <input
            type="text"
            className={inputClass}
            placeholder="如：张医生"
            value={diagnosedBy}
            onChange={(e) => setDiagnosedBy(e.target.value)}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: fieldDelay * 5 }}
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
