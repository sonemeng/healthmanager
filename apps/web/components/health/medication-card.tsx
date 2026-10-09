import { StatusBadge } from './status-badge';
import { Pencil, Trash2 } from 'lucide-react';

interface MedicationCardProps {
  name: string;
  dose: string;
  frequency: string;
  indication: string;
  status: 'active' | 'discontinued';
  startDate: string;
  endDate?: string;
  onEdit?: () => void;
  onDelete?: () => void;
  isDeleting?: boolean;
}

export function MedicationCard({ name, dose, frequency, indication, status, startDate, endDate, onEdit, onDelete, isDeleting }: MedicationCardProps) {
  const dateRange = startDate
    ? `${startDate} 至 ${status === 'active' ? '今' : endDate ?? '—'}`
    : '—';

  return (
    <div className="card p-5 transition-all hover:border-accent-300">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <div className="text-[15px] font-semibold text-neutral-900 font-display">
            {name}
          </div>
          <div className="mt-0.5 text-xs text-neutral-500 font-mono">
            {dose} &middot; {frequency}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge
            status={status === 'active' ? 'normal' : 'neutral'}
            label={status === 'active' ? '在用' : '已停用'}
          />
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
              title="编辑用药记录"
              aria-label={`编辑${name}`}
            >
              <Pencil className="size-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={isDeleting}
              className="rounded-md p-1 text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              title="删除用药记录"
              aria-label={`删除${name}`}
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="mb-2.5 text-[13px] leading-relaxed text-neutral-600 font-display">
        {indication}
      </div>
      <div className="text-[11px] text-neutral-400 font-mono">
        {dateRange}
      </div>
    </div>
  );
}
