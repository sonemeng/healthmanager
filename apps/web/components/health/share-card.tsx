import { StatusBadge } from './status-badge';

interface ShareCardProps {
  grantId: string;
  name: string;
  recipient: string;
  categories: string[];
  accessLevel: string;
  expiresIn: string;
  lastAccessed: string;
  passwordProtected: boolean;
  onRevoke: (grantId: string) => void;
}

export function ShareCard({ grantId, name, recipient, categories, accessLevel, expiresIn, lastAccessed, passwordProtected, onRevoke }: ShareCardProps) {
  return (
    <div className="card p-5">
      <div className="mb-3.5 flex items-start justify-between">
        <div>
          <div className="text-[15px] font-semibold text-neutral-900 font-display">
            {name}
          </div>
          <div className="mt-0.5 text-[13px] text-neutral-500 font-display">
            {recipient}
          </div>
        </div>
        <div className="flex items-center gap-2"><StatusBadge status="info" label={accessLevel} />{passwordProtected && <span className="text-[10px] text-neutral-400">密码保护</span>}</div>
      </div>
      <div className="mb-3.5 flex flex-wrap gap-1.5">
        {categories.map((c) => (
          <span
            key={c}
            className="bg-accent-50 px-2 py-0.5 text-[11px] font-medium text-accent-700 font-mono"
          >
            {c}
          </span>
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-neutral-400 font-mono">
        <span>有效期：{expiresIn}</span><span>最近访问：{lastAccessed}</span>
      </div>
      <button onClick={() => onRevoke(grantId)} className="mt-4 text-[12px] font-medium text-red-600 hover:text-red-700">撤销分享</button>
    </div>
  );
}
