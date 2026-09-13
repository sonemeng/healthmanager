'use client';

import { trpc } from '@/lib/trpc/client';
import { TitleActionHeader } from '@/components/title-action-header';
import { ShareCard } from '@/components/health/share-card';
import { AnimatedEmptyState } from '@/components/animated-empty-state';
import { CATEGORY_LABELS, type DataCategory } from '@openvitals/common';
import { formatRelativeTime } from '@/lib/health-utils';
import { useState } from 'react';
import { Share2, Users, ShieldCheck, Link2, Eye, Lock, Copy } from 'lucide-react';
import { toast } from 'sonner';

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
  const utils = trpc.useUtils();
  const policies = data?.items ?? [];
  const activeProfile = trpc.profiles.active.useQuery();
  const [showForm, setShowForm] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [accessLevel, setAccessLevel] = useState<'view' | 'view_download' | 'full'>('view_download');
  const [expiresInDays, setExpiresInDays] = useState('30');
  const [password, setPassword] = useState('');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const createPolicy = trpc.sharing.createPolicy.useMutation();
  const createGrant = trpc.sharing.createGrant.useMutation();
  const revokeGrant = trpc.sharing.revokeGrant.useMutation({ onSuccess: () => { void utils.sharing.listGrants.invalidate(); toast.success('分享链接已撤销'); }, onError: (error) => toast.error(error.message || '撤销失败') });
  const isLocalOnly = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);

  const createShare = async () => {
    try {
      const { policyId } = await createPolicy.mutateAsync({
        name: `${activeProfile.data?.name ?? '健康档案'}健康数据`,
        categories: ['blood_chemistry', 'hematology', 'endocrine', 'medication', 'condition'],
        accessLevel,
        ...(expiresInDays ? { expiresAt: new Date(Date.now() + Number(expiresInDays) * 86_400_000) } : {}),
      });
      const grant = await createGrant.mutateAsync({
        policyId,
        ...(recipientEmail.trim() ? { recipientEmail: recipientEmail.trim() } : {}),
        ...(password ? { password } : {}),
      });
      setShareUrl(grant.shareUrl);
      setShowForm(false);
      void utils.sharing.listGrants.invalidate();
      toast.success('成员专属分享链接已创建');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '创建分享链接失败');
    }
  };

  const copyShareUrl = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    toast.success('分享链接已复制');
  };

  const shareButton = <button onClick={() => setShowForm(true)} disabled={isLocalOnly} className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 transition-colors disabled:cursor-not-allowed disabled:opacity-50">分享当前档案</button>;
  const localOnlyNotice = isLocalOnly ? <div className="mt-5 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-[13px] leading-5 text-neutral-600">未配置服务器，暂不可使用。</div> : null;

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
        passwordProtected: Boolean(grant.hasPassword),
      })),
  );

  if (cards.length === 0) {
    return (
      <div>
        <TitleActionHeader
          title="数据分享"
          subtitle="Share scoped slices of your health data with providers, family, or care team."
          actions={shareButton}
        />
        {localOnlyNotice}
        <ShareCreator show={showForm} profileName={activeProfile.data?.name} recipientEmail={recipientEmail} accessLevel={accessLevel} expiresInDays={expiresInDays} password={password} shareUrl={shareUrl} pending={createPolicy.isPending || createGrant.isPending} onRecipientChange={setRecipientEmail} onAccessLevelChange={setAccessLevel} onExpiresChange={setExpiresInDays} onPasswordChange={setPassword} onCreate={createShare} onClose={() => setShowForm(false)} onCopy={copyShareUrl} />
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
        actions={shareButton}
      />

      {localOnlyNotice}
      <ShareCreator show={showForm} profileName={activeProfile.data?.name} recipientEmail={recipientEmail} accessLevel={accessLevel} expiresInDays={expiresInDays} password={password} shareUrl={shareUrl} pending={createPolicy.isPending || createGrant.isPending} onRecipientChange={setRecipientEmail} onAccessLevelChange={setAccessLevel} onExpiresChange={setExpiresInDays} onPasswordChange={setPassword} onCreate={createShare} onClose={() => setShowForm(false)} onCopy={copyShareUrl} />

      <div className="mt-7 grid grid-cols-1 gap-4 md:grid-cols-2">
        {cards.map((card) => (
          <ShareCard
            key={card.key}
            grantId={card.key}
            name={card.name}
            recipient={card.recipient}
            categories={card.categories}
            accessLevel={card.accessLevel}
            expiresIn={card.expiresIn}
            lastAccessed={card.lastAccessed}
            passwordProtected={card.passwordProtected}
            onRevoke={(grantId) => { if (window.confirm('确定撤销该分享链接？链接将立即失效。')) revokeGrant.mutate({ grantId }); }}
          />
        ))}
      </div>
    </div>
  );
}

function ShareCreator({ show, profileName, recipientEmail, accessLevel, expiresInDays, password, shareUrl, pending, onRecipientChange, onAccessLevelChange, onExpiresChange, onPasswordChange, onCreate, onClose, onCopy }: { show: boolean; profileName?: string; recipientEmail: string; accessLevel: 'view' | 'view_download' | 'full'; expiresInDays: string; password: string; shareUrl: string | null; pending: boolean; onRecipientChange: (value: string) => void; onAccessLevelChange: (value: 'view' | 'view_download' | 'full') => void; onExpiresChange: (value: string) => void; onPasswordChange: (value: string) => void; onCreate: () => void; onClose: () => void; onCopy: () => void }) {
  if (!show && !shareUrl) return null;
  return <div className="mt-5 rounded-xl border border-accent-200 bg-accent-50 p-4">
    {shareUrl ? <div><p className="text-sm font-semibold text-neutral-900">分享链接已创建</p><p className="mt-1 text-[12px] text-neutral-600">该链接只包含 {profileName ?? '当前成员'} 的健康数据。</p><div className="mt-3 flex gap-2"><input readOnly value={shareUrl} className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[12px] text-neutral-600" /><button onClick={onCopy} className="inline-flex items-center gap-1 rounded-lg bg-neutral-900 px-3 py-2 text-[12px] font-medium text-white"><Copy className="size-3" />复制</button></div></div> : <div><p className="text-sm font-semibold text-neutral-900">分享 {profileName ?? '当前成员'} 的健康数据</p><p className="mt-1 text-[12px] text-neutral-600">链接将永久绑定此成员，不会随之后切换档案而改变。</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><input type="email" value={recipientEmail} onChange={(event) => onRecipientChange(event.target.value)} placeholder="接收人邮箱（可选）" className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[13px]" /><select value={accessLevel} onChange={(event) => onAccessLevelChange(event.target.value as 'view' | 'view_download' | 'full')} className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[13px]"><option value="view">仅趋势，不含数值</option><option value="view_download">完整数值</option><option value="full">完整访问</option></select><select value={expiresInDays} onChange={(event) => onExpiresChange(event.target.value)} className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[13px]"><option value="7">7 天有效</option><option value="30">30 天有效</option><option value="90">90 天有效</option><option value="">永久有效</option></select><input type="password" value={password} onChange={(event) => onPasswordChange(event.target.value)} placeholder="访问密码（可选，至少 8 位）" className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[13px]" /></div><div className="mt-3 flex gap-2"><button onClick={onClose} className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[13px] text-neutral-600">取消</button><button onClick={onCreate} disabled={pending || (password.length > 0 && password.length < 8)} className="rounded-lg bg-accent-600 px-3 py-2 text-[13px] font-medium text-white disabled:opacity-50">{pending ? '创建中…' : '创建链接'}</button></div></div>}
  </div>;
}
