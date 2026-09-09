'use client';

import { useMemo } from 'react';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';
import { Check, X } from 'lucide-react';

interface AdherenceTrackerProps {
  medications: Array<{
    id: string;
    name: string;
    isActive: boolean | null;
  }>;
}

function getWeekDates(): { date: string; label: string; isToday: boolean }[] {
  const today = new Date();
  const dates = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push({
      date: d.toISOString().split('T')[0]!,
      label: d.toLocaleDateString('zh-CN', { weekday: 'short' }),
      isToday: i === 0,
    });
  }
  return dates;
}

export function AdherenceTracker({ medications }: AdherenceTrackerProps) {
  const activeMeds = medications.filter((m) => m.isActive);
  const weekDates = useMemo(() => getWeekDates(), []);

  const dateFrom = weekDates[0]!.date;
  const dateTo = weekDates[weekDates.length - 1]!.date;

  const { data: adherenceData } = trpc.medications.getAdherence.useQuery({
    dateFrom,
    dateTo,
  });

  const utils = trpc.useUtils();
  const logMutation = trpc.medications.logAdherence.useMutation({
    onSuccess: () => {
      utils.medications.getAdherence.invalidate({ dateFrom, dateTo });
    },
  });

  // Build adherence map: medId -> date -> taken
  const adherenceMap = useMemo(() => {
    const map = new Map<string, Map<string, boolean>>();
    for (const log of adherenceData?.logs ?? []) {
      const medMap = map.get(log.medicationId) ?? new Map();
      medMap.set(log.logDate, log.taken ?? false);
      map.set(log.medicationId, medMap);
    }
    return map;
  }, [adherenceData]);

  if (activeMeds.length === 0) return null;

  // Calculate streak for each medication
  const getStreak = (medId: string): number => {
    const medMap = adherenceMap.get(medId);
    if (!medMap) return 0;
    let streak = 0;
    for (let i = weekDates.length - 1; i >= 0; i--) {
      if (medMap.get(weekDates[i]!.date)) streak++;
      else break;
    }
    return streak;
  };

  const handleToggle = (medicationId: string, date: string, currentTaken: boolean | undefined) => {
    logMutation.mutate({
      medicationId,
      logDate: new Date(date + 'T12:00:00'),
      taken: !currentTaken,
    });
  };

  return (
    <div className="card mt-6">
      <div className="px-4 py-3 border-b border-neutral-200">
        <h2 className="text-[13px] font-semibold text-neutral-900 font-display">
          This Week
        </h2>
      </div>

      {/* Header row with day labels */}
      <div className="grid items-center gap-2 px-4 py-2 border-b border-neutral-100" style={{
        gridTemplateColumns: '1fr repeat(7, 32px) 50px',
      }}>
        <span className="text-[10px] font-mono font-bold uppercase tracking-[0.06em] text-neutral-400">
          Medication
        </span>
        {weekDates.map((d) => (
          <span
            key={d.date}
            className={cn(
              'text-center text-[10px] font-mono font-bold uppercase tracking-[0.04em]',
              d.isToday ? 'text-accent-600' : 'text-neutral-400',
            )}
          >
            {d.label.slice(0, 2)}
          </span>
        ))}
        <span className="text-[10px] font-mono font-bold uppercase tracking-[0.06em] text-neutral-400 text-right">
          Streak
        </span>
      </div>

      {/* Medication rows */}
      {activeMeds.map((med) => {
        const medAdherence = adherenceMap.get(med.id);
        const streak = getStreak(med.id);

        return (
          <div
            key={med.id}
            className="grid items-center gap-2 px-4 py-2.5 border-b border-neutral-50 last:border-0"
            style={{
              gridTemplateColumns: '1fr repeat(7, 32px) 50px',
            }}
          >
            <span className="text-[12px] font-medium text-neutral-800 font-body truncate">
              {med.name}
            </span>
            {weekDates.map((d) => {
              const taken = medAdherence?.get(d.date);
              return (
                <button
                  key={d.date}
                  onClick={() => handleToggle(med.id, d.date, taken)}
                  disabled={logMutation.isPending}
                  className={cn(
                    'size-7 flex items-center justify-center border transition-all cursor-pointer mx-auto',
                    taken === true
                      ? 'bg-health-normal border-health-normal text-white'
                      : taken === false
                        ? 'bg-red-50 border-red-200 text-red-400'
                        : 'bg-neutral-50 border-neutral-200 text-neutral-300 hover:border-neutral-300',
                  )}
                >
                  {taken === true ? (
                    <Check className="size-3" strokeWidth={3} />
                  ) : taken === false ? (
                    <X className="size-3" strokeWidth={2} />
                  ) : (
                    <span className="size-1.5 bg-neutral-200" />
                  )}
                </button>
              );
            })}
            <span className={cn(
              'text-right text-[12px] font-mono font-semibold tabular-nums',
              streak >= 7 ? 'text-health-normal' : streak >= 3 ? 'text-accent-600' : 'text-neutral-400',
            )}>
              {streak}d
            </span>
          </div>
        );
      })}
    </div>
  );
}
