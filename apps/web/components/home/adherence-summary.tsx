'use client';

import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
import { Pill, ChevronRight, Check } from 'lucide-react';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface AdherenceSummaryProps {
  activeMedications: Array<{ id: string; name: string }>;
}

function getWeekRange(): { dateFrom: string; dateTo: string } {
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 6);
  return {
    dateFrom: weekAgo.toISOString().split('T')[0]!,
    dateTo: today.toISOString().split('T')[0]!,
  };
}

export function AdherenceSummary({ activeMedications }: AdherenceSummaryProps) {
  const { dateFrom, dateTo } = useMemo(() => getWeekRange(), []);
  const { data } = trpc.medications.getAdherence.useQuery(
    { dateFrom, dateTo },
    { enabled: activeMedications.length > 0 },
  );

  if (activeMedications.length === 0) return null;

  const logs = data?.logs ?? [];
  const today = new Date().toISOString().split('T')[0]!;

  // Today's status
  const todayLogs = logs.filter((l) => l.logDate === today);
  const takenToday = todayLogs.filter((l) => l.taken).length;

  // Weekly adherence
  const totalPossible = activeMedications.length * 7;
  const totalTaken = logs.filter((l) => l.taken).length;
  const weeklyPct = totalPossible > 0 ? Math.round((totalTaken / totalPossible) * 100) : 0;

  return (
    <Link
      href="/medications"
      className="card p-4 hover:border-accent-300 transition-colors block"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Pill className="size-3.5 text-neutral-400" />
          <span className="text-[10px] font-mono font-bold uppercase tracking-[0.06em] text-neutral-500">
            今日用药
          </span>
        </div>
        <ChevronRight className="size-3 text-neutral-300" />
      </div>

      <div className="flex items-baseline gap-2">
        <span className={cn(
          'text-[22px] font-mono font-semibold tabular-nums leading-none',
          takenToday === activeMedications.length ? 'text-health-normal' : 'text-neutral-900',
        )}>
          {takenToday}/{activeMedications.length}
        </span>
        <span className="text-[11px] font-mono text-neutral-400">taken</span>
      </div>

      {/* Weekly bar */}
      <div className="mt-3 flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-neutral-100">
          <div
            className="h-full bg-health-normal transition-all"
            style={{ width: `${weeklyPct}%` }}
          />
        </div>
        <span className="text-[10px] font-mono text-neutral-400 tabular-nums shrink-0">
          {weeklyPct}% 本周完成
        </span>
      </div>
    </Link>
  );
}
