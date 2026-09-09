"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const ACTIVE_PROFILE_COOKIE_NAME = "hm_profile";

export function getActiveProfileCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    /(?:^|;\s*)hm_profile=([^;]+)/,
  );
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function setActiveProfileCookie(id: string) {
  document.cookie = `hm_profile=${encodeURIComponent(id)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

export function MemberSwitcher() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const profilesQuery = trpc.profiles.list.useQuery();
  const profiles = profilesQuery.data ?? [];
  const [activeId, setActiveId] = useState<string | null>(null);

  // 无 cookie 时默认写第一个（优先 isDefault）
  useEffect(() => {
    if (profiles.length === 0) return;
    const current = getActiveProfileCookie();
    if (current && profiles.some((p) => p.id === current)) {
      setActiveId(current);
      return;
    }
    const fallback =
      profiles.find((p) => p.isDefault) ?? profiles[0] ?? null;
    if (fallback) {
      setActiveProfileCookie(fallback.id);
      setActiveId(fallback.id);
    }
  }, [profiles]);

  if (profiles.length === 0) return null;

  const activeProfile = profiles.find((p) => p.id === activeId);

  const switchProfile = (id: string) => {
    setActiveProfileCookie(id);
    setActiveId(id);
    // 清空全部 tRPC 缓存 + 刷新服务端组件
    utils.invalidate();
    router.refresh();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-[13px] font-medium text-neutral-700 shadow-xs transition-all hover:border-neutral-300 hover:bg-neutral-50 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          title="切换家庭成员"
        >
          <Users className="h-4 w-4 text-neutral-500" />
          <span className="hidden sm:inline">{activeProfile?.name ?? "选择成员"}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 card">
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
            {p.id === activeId && (
              <span className="text-[10px] font-mono text-accent-600">当前</span>
            )}
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
