import { cn } from '@/lib/utils';
import { ProvenancePill } from './provenance-pill';

interface AIMessageBubbleProps {
  role: 'user' | 'ai';
  content: string;
  sources?: Array<{ label: string; icon: string }>;
}

export function AIMessageBubble({ role, content, sources }: AIMessageBubbleProps) {
  const isAI = role === 'ai';
  return (
    <div
      className={`flex flex-col gap-2 max-w-[85%] ${isAI ? 'self-start items-start' : 'self-end items-end'}`}
    >
      {isAI && (
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.06em] text-accent-500 font-mono"
        >
          OpenVitals AI
        </span>
      )}
      <div
        className={cn(
          isAI
            ? 'rounded-[4px_16px_16px_16px] border border-neutral-200 bg-white px-[18px] py-3.5 text-neutral-800'
            : 'rounded-[16px_16px_4px_16px] bg-accent-500 px-[18px] py-3.5 text-white',
          'font-body text-[14px] leading-[1.65] tracking-[0.005em]'
        )}
      >
        {content}
      </div>
      {sources && sources.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sources.map((s, i) => (
            <ProvenancePill key={i} label={s.label} icon={s.icon} />
          ))}
        </div>
      )}
    </div>
  );
}
