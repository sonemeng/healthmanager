'use client';

import Link from 'next/link';
import { Clock, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface RetestItem {
  metricCode: string;
  metricName: string;
  urgency: 'overdue' | 'due_soon' | 'upcoming' | 'on_track';
  dueInDays: number;
  daysSinceLastTest: number;
  healthStatus: string;
}

interface UpcomingRetestsProps {
  items: RetestItem[];
}

const urgencyStyles: Record<string, { dot: string; text: string; label: string }> = {
  overdue: {
    dot: 'bg-testing-overdue',
    text: 'text-testing-overdue',
    label: '已逾期',
  },
  due_soon: {
    dot: 'bg-testing-due',
    text: 'text-testing-due',
    label: '即将到期',
  },
  upcoming: {
    dot: 'bg-testing-upcoming',
    text: 'text-testing-upcoming',
    label: '计划中',
  },
  on_track: {
    dot: 'bg-testing-on-track',
    text: 'text-testing-on-track',
    label: '按计划',
  },
};

export function UpcomingRetests({ items }: UpcomingRetestsProps) {
  // Only show actionable items (overdue, due_soon, upcoming)
  const actionable = items.filter((i) => i.urgency !== 'on_track').slice(0, 5);

  if (actionable.length === 0) return null;

  return (
    <div className="card">
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
        <div className="flex items-center gap-2">
          <Clock className="size-3.5 text-neutral-400" />
          <h2 className="text-[13px] font-semibold text-neutral-900 font-display">
            复查提醒
          </h2>
        </div>
        <Link
          href="/testing"
          className="text-[11px] font-mono text-neutral-400 hover:text-neutral-600 transition-colors flex items-center gap-1"
        >
          Plan
          <ChevronRight className="size-3" />
        </Link>
      </div>
      <div className="divide-y divide-neutral-100">
        {actionable.map((item) => {
          const style = urgencyStyles[item.urgency] ?? urgencyStyles.on_track;
          const dueText =
            item.dueInDays <= 0
              ? `${Math.abs(item.dueInDays)}d overdue`
              : `in ${item.dueInDays}d`;

          return (
            <div key={item.metricCode} className="flex items-center px-4 py-3">
              <span className={cn('size-[5px] shrink-0 mr-3', style.dot)} />
              <div className="flex-1 min-w-0">
                <span className="text-[12px] font-medium text-neutral-700 font-body truncate block">
                  {item.metricName}
                </span>
                <span className="text-[10px] font-mono text-neutral-400">
                  Last tested {item.daysSinceLastTest}d ago
                </span>
              </div>
              <span className={cn('text-[10px] font-mono font-bold uppercase tracking-[0.04em]', style.text)}>
                {dueText}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
