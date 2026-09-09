'use client';

import { trpc } from '@/lib/trpc/client';
import { TitleActionHeader } from '@/components/title-action-header';
import { ShareCard } from '@/components/health/share-card';
import { AnimatedEmptyState } from '@/components/animated-empty-state';
import { CATEGORY_LABELS, type DataCategory } from '@openvitals/common';
import { formatRelativeTime } from '@/lib/health-utils';
import { Share2, Users, ShieldCheck, Link2, Eye, Lock } from 'lucide-react';

function formatExpiresIn(expiresAt: Date | string | null | undefined): string {
  if (!expiresAt) return '永久有效';
  const exp = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  const diff = exp.getTime() - Date.now();
  if (diff <= 0) return '已过期';
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days === 1) return '1 day';
  return `${days} days`;
}

const ACCESS_LEVEL_LABELS: Record<string, string> = {
  view: '仅趋势',
  view_download: '完整数值',
  full: '完整访问',
};

const emptyIcons = [Share2, Users, ShieldCheck, Link2, Eye, Lock];

export default function SharingPage() {
  const { data, isLoading } = trpc.sharing.listGrants.useQuery();
  const policies = data?.items ?? [];

  if (isLoading) {
    return (
      <div>
        <TitleActionHeader title="数据分享" subtitle="加载中…" />
        <div className="mt-7 grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="card h-40 animate-pulse bg-neutral-50" />
          ))}
        </div>
      </div>
    );
  }

  // Flatten policies with grants into ShareCard format
  const cards = policies.flatMap((policy) =>
    policy.accessGrants
      .filter((g) => g.isActive)
      .map((grant) => ({
        key: grant.id,
        name: policy.name,
        recipient: grant.recipientEmail ?? '分享链接',
        categories: (policy.categories as string[]).map(
          (c) => CATEGORY_LABELS[c as DataCategory] ?? c,
        ),
        accessLevel: ACCESS_LEVEL_LABELS[policy.accessLevel] ?? policy.accessLevel,
        expiresIn: formatExpiresIn(policy.expiresAt),
        lastAccessed: grant.lastAccessedAt
          ? formatRelativeTime(grant.lastAccessedAt)
          : '尚未被访问',
      })),
  );

  if (cards.length === 0) {
    return (
      <div>
        <TitleActionHeader
          title="数据分享"
          subtitle="Share scoped slices of your health data with providers, family, or care team."
          actions={
            <button className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 transition-colors">
              分享我的数据
            </button>
          }
        />
        <div className="mt-7">
          <AnimatedEmptyState
            title="还没有分享记录"
            description="Share scoped slices of your health data with providers, family, or care team."
            cardIcon={({ index }) => emptyIcons[index % emptyIcons.length]!}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <TitleActionHeader
        title="数据分享"
        subtitle="Share scoped slices of your health data with providers, family, or care team."
        actions={
          <button className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 transition-colors">
            分享我的数据
          </button>
        }
      />

      <div className="mt-7 grid grid-cols-1 gap-4 md:grid-cols-2">
        {cards.map((card) => (
          <ShareCard
            key={card.key}
            name={card.name}
            recipient={card.recipient}
            categories={card.categories}
            accessLevel={card.accessLevel}
            expiresIn={card.expiresIn}
            lastAccessed={card.lastAccessed}
          />
        ))}
      </div>
    </div>
  );
}
