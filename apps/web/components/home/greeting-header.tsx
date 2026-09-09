'use client';

import { useEffect, useState } from 'react';
import { StatusBadge } from '@/components/health/status-badge';
import { formatDate } from '@/lib/utils';

interface GreetingHeaderProps {
  firstName: string;
  summaryLine: string;
  abnormalCount: number;
}

// 服务端渲染"你好"+空日期，客户端挂载后再计算，根治 new Date() 水合不一致
export function GreetingHeader({ firstName, summaryLine, abnormalCount }: GreetingHeaderProps) {
  const [greeting, setGreeting] = useState('你好');
  const [today, setToday] = useState('');

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('早上好');
    else if (hour < 18) setGreeting('下午好');
    else setGreeting('晚上好');
    setToday(formatDate(new Date()));
  }, []);

  const displayName = firstName ? `，${firstName}` : '';

  return (
    <div>
      <h1 className="font-display text-[28px] md:text-[34px] font-medium tracking-[-0.03em] text-neutral-900">
        {greeting}{displayName}
      </h1>
      <div className="mt-2 flex items-center gap-3">
        <p className="text-[14px] text-neutral-500 font-display">{summaryLine}</p>
        {abnormalCount > 0 && (
          <StatusBadge status="warning" label={`${abnormalCount} 项异常`} />
        )}
      </div>
      <p className="mt-1 text-[11px] text-neutral-400 font-mono">{today}</p>
    </div>
  );
}
