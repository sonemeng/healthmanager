import { StatusBadge } from './status-badge';
import { Trash2 } from 'lucide-react';

interface MedicationCardProps {
  name: string;
  dose: string;
  frequency: string;
  indication: string;
  status: 'active' | 'discontinued';
  startDate: string;
  onDelete?: () => void;
  isDeleting?: boolean;
}

export function MedicationCard({ name, dose, frequency, indication, status, startDate, onDelete, isDeleting }: MedicationCardProps) {
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
        Started {startDate}
      </div>
    </div>
  );
}
