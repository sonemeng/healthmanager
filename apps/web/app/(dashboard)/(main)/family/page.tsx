'use client';

import { CalendarDays, ClipboardCheck, FileText, Pill, UsersRound } from 'lucide-react';
import { setActiveProfileCookie } from '@/components/settings/member-switcher';
import { trpc } from '@/lib/trpc/client';

function dateLabel(value: Date | string | null) {
  if (!value) return '暂无记录';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: 'short', day: 'numeric',
  }).format(new Date(value));
}

export default function FamilyPage() {
  const summary = trpc.profiles.familySummary.useQuery();

  function switchProfile(id: string) {
    setActiveProfileCookie(id);
    window.location.assign('/home');
  }

  return (
    <div>
      <div className="flex items-start gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-accent-50 text-accent-700"><UsersRound className="size-5" /></span>
        <div>
          <h1 className="text-[26px] font-display font-semibold tracking-[-0.03em] text-neutral-900">家庭健康概览</h1>
          <p className="mt-1 text-[13px] text-neutral-500">仅展示档案状态和待办，不展示具体检验数值。</p>
        </div>
      </div>

      {summary.isLoading ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2">{Array.from({ length: 2 }).map((_, index) => <div key={index} className="card h-56 animate-pulse bg-neutral-50" />)}</div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {summary.data?.map((profile) => (
            <button key={profile.id} onClick={() => switchProfile(profile.id)} className="card p-5 text-left transition-colors hover:border-accent-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ backgroundColor: profile.avatarColor ?? '#18a058' }}>{profile.name.slice(0, 1)}</span>
                  <div><h2 className="font-display text-[16px] font-semibold text-neutral-900">{profile.name}</h2><p className="mt-0.5 text-[11px] text-neutral-500">{profile.isDefault ? '本人档案' : '家庭成员'}</p></div>
                </div>
                <span className="text-[11px] font-medium text-accent-700">查看档案</span>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-neutral-100 pt-4 text-[12px]">
                <div><p className="flex items-center gap-1 text-neutral-400"><CalendarDays className="size-3" />最近报告</p><p className="mt-1 font-medium text-neutral-800">{dateLabel(profile.latestReportAt)}</p></div>
                <div><p className="flex items-center gap-1 text-neutral-400"><ClipboardCheck className="size-3" />待复查</p><p className="mt-1 font-medium text-neutral-800">{profile.pendingRetestCount} 项</p></div>
                <div><p className="flex items-center gap-1 text-neutral-400"><Pill className="size-3" />在用药</p><p className="mt-1 font-medium text-neutral-800">{profile.activeMedicationCount} 种</p></div>
                <div><p className="flex items-center gap-1 text-neutral-400"><FileText className="size-3" />健康记录</p><p className="mt-1 font-medium text-neutral-800">{profile.healthRecordCount} 条</p></div>
              </div>
              <div className="mt-5"><div className="flex justify-between text-[11px] text-neutral-500"><span>基础资料完整度</span><span>{profile.completeness}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100"><div className="h-full rounded-full bg-accent-500" style={{ width: `${profile.completeness}%` }} /></div></div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
