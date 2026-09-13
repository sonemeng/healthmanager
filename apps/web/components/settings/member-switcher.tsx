"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RotateCcw, Users } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const ACTIVE_PROFILE_COOKIE_NAME = "hm_profile";
const ACTIVE_PROFILE_EXPLICIT_COOKIE_NAME = "hm_profile_explicit";

export function getActiveProfileCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    /(?:^|;\s*)hm_profile=([^;]+)/,
  );
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function setActiveProfileCookie(id: string) {
  document.cookie = `hm_profile=${encodeURIComponent(id)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  document.cookie = `${ACTIVE_PROFILE_EXPLICIT_COOKIE_NAME}=1; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

function hasExplicitProfileSelection(): boolean {
  return typeof document !== "undefined" && /(?:^|;\s*)hm_profile_explicit=1(?:;|$)/.test(document.cookie);
}

export function MemberSwitcher() {
  const profilesQuery = trpc.profiles.list.useQuery();
  const profiles = profilesQuery.data ?? [];
  const [activeId, setActiveId] = useState<string | null>(null);

  // 无 cookie 时默认写第一个（优先 isDefault）
  useEffect(() => {
    if (profiles.length === 0) return;
    const current = getActiveProfileCookie();
    if (current && hasExplicitProfileSelection() && profiles.some((p) => p.id === current)) {
      setActiveId(current);
      return;
    }
    const fallback =
      profiles.find((p) => p.isDefault) ?? profiles[0] ?? null;
    if (fallback) {
      // Old versions treated the first added family member as the default.
      // Establish the account owner's profile as the default once on upgrade.
      document.cookie = `hm_profile=${encodeURIComponent(fallback.id)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      setActiveId(fallback.id);
    }
  }, [profiles]);

  if (profiles.length === 0) return null;

  const activeProfile = profiles.find((p) => p.id === activeId);
  const defaultProfile = profiles.find((p) => p.isDefault) ?? profiles[0];

  const switchProfile = (id: string) => {
    const profile = profiles.find((item) => item.id === id);
    if (!profile || id === activeId) return;
    setActiveProfileCookie(id);
    setActiveId(id);
    toast.success(`已切换至${profile.name}的健康档案`);
    // Health queries are profile-scoped by cookie, so reload to prevent any
    // already-mounted page from rendering a previous profile's cached data.
    window.setTimeout(() => window.location.reload(), 150);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-[13px] font-medium text-neutral-700 shadow-xs transition-all hover:border-neutral-300 hover:bg-neutral-50 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          title={`切换档案（当前：${activeProfile?.name ?? "未选择"}）`}
        >
          <Users className="h-4 w-4 text-neutral-500" />
          <span className="hidden sm:inline">切换档案</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 card">
        <div className="px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400">当前健康档案</p>
          <p className="mt-0.5 truncate text-[13px] font-medium text-neutral-800">{activeProfile?.name ?? "选择成员"}</p>
        </div>
        {defaultProfile && defaultProfile.id !== activeId && (
          <DropdownMenuItem
            onClick={() => switchProfile(defaultProfile.id)}
            className="flex items-center gap-2.5 text-accent-700"
          >
            <RotateCcw className="size-3.5" />
            <span className="flex-1">返回本人档案</span>
            <span className="text-[10px] text-neutral-400">{defaultProfile.name}</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {profiles.map((p) => (
          <DropdownMenuItem
            key={p.id}
            onClick={() => switchProfile(p.id)}
            className="flex items-center gap-2.5"
          >
            <span
              className="inline-block size-3 rounded-full shrink-0"
              style={{ backgroundColor: p.avatarColor ?? "#18a058" }}
            />
            <span className="flex-1 truncate">{p.name}</span>
            {p.isDefault && <span className="text-[10px] text-neutral-400">本人</span>}
            {p.id === activeId && <span className="text-[10px] font-mono text-accent-600">当前</span>}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings" className="text-[13px] text-neutral-500">
            管理成员档案 →
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
