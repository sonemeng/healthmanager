"use client";

import { RotateCcw, Users } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { setActiveProfileCookie } from "@/components/settings/member-switcher";

export function ProfileContextBar() {
  const activeProfile = trpc.profiles.active.useQuery();
  const profiles = trpc.profiles.list.useQuery();
  const profile = activeProfile.data;
  const owner = profiles.data?.find((item) => item.isDefault);

  if (!profile) return null;

  const isOwner = profile.isDefault;
  const returnToOwner = () => {
    if (!owner) return;
    setActiveProfileCookie(owner.id);
    window.location.reload();
  };

  return (
    <div className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-[1400px] items-center gap-2 px-3 py-2 text-[12px] text-neutral-600 md:px-6">
        <Users className="size-3.5 text-neutral-400" />
        <span>正在查看：</span>
        <span className="font-semibold text-neutral-900">{profile.name}</span>
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-500">
          {isOwner ? "本人档案" : "家庭成员"}
        </span>
        {!isOwner && owner && (
          <button
            type="button"
            onClick={returnToOwner}
            className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-accent-700 hover:text-accent-800"
          >
            <RotateCcw className="size-3" />
            返回本人档案
          </button>
        )}
      </div>
    </div>
  );
}
