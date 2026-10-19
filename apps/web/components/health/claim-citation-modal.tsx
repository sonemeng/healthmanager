'use client';

import { useState } from 'react';
import { Template } from '@/components/modal/template';
import { Button } from '@/components/button';
import { useModal } from '@/components/modal/provider';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';

/**
 * 「已核对」认领弹窗（spec 21 §15.7 S5.2）。
 *
 * 只做两件事——选一条结论、填一句依据，写回 provenance 四列。**不是**通用字典编辑器
 * （§六 非目标）；区间数值/来源等级都不在这里改，那些走迁移或专门的编辑入口。
 *
 * 两种结论对应 `citation_kind`：
 *   cited  —— 找到了文献/指南/说明书依据，把出处一句话写清（后面能回溯到哪本哪版）
 *   exempt —— 确认这一项**本来就没有**通行参考区间（方法依赖、半定量、尿沉渣形态等），
 *             写清「为什么没有」；tier 仍是 unverified，但不再进待补清单
 *
 * 为什么必须在 UI 里填：R8 的判据是 tier+citation+citation_kind 三条件联合，
 * 认领完这一条就不再被报（§15.6 N4/N5：清单要能自己变短，而不是另维护一份 md）。
 */

const inputClass =
  'w-full rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-[14px] text-neutral-900 placeholder:text-neutral-400 focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100 transition-all';

const labelClass =
  'block text-[13px] font-medium text-neutral-700 mb-1.5 font-display';

type CitationKind = 'cited' | 'exempt';

const KINDS: Array<{
  value: CitationKind;
  title: string;
  hint: string;
  placeholder: string;
}> = [
  {
    value: 'cited',
    title: '有依据',
    hint: '找到了文献 / 指南 / 试剂说明书',
    placeholder: '如：WS/T 404.2-2012 表1；或 罗氏 Elecsys 试剂说明书 v3.0',
  },
  {
    value: 'exempt',
    title: '确无通行区间',
    hint: '方法依赖 / 半定量 / 形态学，各检验科自定',
    placeholder: '如：无通行参考区间，随仪器与试剂不同，以报告单为准',
  },
];

export interface ClaimCitationModalProps {
  target: 'metric' | 'range';
  /** metric: 指标 id；range: 区间 id */
  id: string | number;
  /** 展示用名称，如「超敏 C 反应蛋白」或「(男) 10~57 nmol/L」 */
  name: string;
  /** 指标代码，仅用于展示 */
  metricCode?: string;
  onDone?: () => void;
}

export function ClaimCitationModal({
  target,
  id,
  name,
  metricCode,
  onDone,
}: ClaimCitationModalProps) {
  const modal = useModal();
  const utils = trpc.useUtils();

  const [kind, setKind] = useState<CitationKind>('cited');
  const [citation, setCitation] = useState('');

  const claim = trpc.metrics.claimCitation.useMutation({
    onSuccess: () => {
      // 两处数据源都要刷：列表读 metrics.list，区间读 metrics.referenceRanges
      utils.metrics.list.invalidate();
      utils.metrics.referenceRanges.invalidate();
      modal.hide();
      onDone?.();
    },
  });

  const active = KINDS.find((k) => k.value === kind)!;
  const canSubmit = citation.trim().length > 0 && !claim.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    claim.mutate({
      target,
      id,
      citationKind: kind,
      citation: citation.trim(),
    });
  }

  return (
    <Template
      title="核对来源"
      description={`为「${name}」补一条可追溯的依据；保存后即从「来源待补」清单移除。`}
      footer={
        <div className="flex flex-1 items-center justify-between gap-x-3">
          <Button onClick={() => modal.hide()} variant="ghost" text="取消" />
          <Button
            onClick={handleSubmit}
            text="保存"
            loading={claim.isPending}
            disabled={!canSubmit}
          />
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {metricCode && (
          <div className="text-[11px] text-neutral-400 font-mono">
            {metricCode}
            {target === 'range' ? ' · 参考区间行' : ' · 指标条目'}
          </div>
        )}

        <div>
          <span className={labelClass}>结论</span>
          <div className="grid grid-cols-2 gap-2">
            {KINDS.map((k) => {
              const selected = kind === k.value;
              return (
                <button
                  key={k.value}
                  type="button"
                  onClick={() => setKind(k.value)}
                  className={cn(
                    'cursor-pointer rounded-lg border px-3 py-2.5 text-left transition-all',
                    selected
                      ? 'border-accent-300 bg-accent-50/60 ring-2 ring-accent-100'
                      : 'border-neutral-200 bg-white hover:border-neutral-300',
                  )}
                >
                  <div
                    className={cn(
                      'text-[13px] font-medium font-body',
                      selected ? 'text-accent-700' : 'text-neutral-800',
                    )}
                  >
                    {k.title}
                  </div>
                  <div className="mt-0.5 text-[11px] leading-snug text-neutral-500 font-body">
                    {k.hint}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className={labelClass} htmlFor="claim-citation">
            {kind === 'cited' ? '依据出处' : '为什么没有'}
          </label>
          <textarea
            id="claim-citation"
            value={citation}
            onChange={(e) => setCitation(e.target.value)}
            placeholder={active.placeholder}
            rows={3}
            className={cn(inputClass, 'resize-none leading-relaxed')}
          />
          <p className="mt-1.5 text-[11px] leading-relaxed text-neutral-400 font-body">
            {kind === 'cited'
              ? '写到能回溯到具体版本的程度（标准号 + 表号 / 书名 + 版次 / 说明书型号）。'
              : '写明为什么没有通行区间；tier 仍记为未核验，但不再计入待补清单。'}
          </p>
        </div>

        {claim.error && (
          <div className="rounded-lg bg-health-warning-bg px-3 py-2 text-[12px] text-health-warning font-body">
            {claim.error.message}
          </div>
        )}
      </form>
    </Template>
  );
}
