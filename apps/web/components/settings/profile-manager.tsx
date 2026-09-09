"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Pencil, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const inputClass =
  "rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[13px] text-neutral-900 placeholder:text-neutral-400 focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100 transition-all";

interface ProfileForm {
  name: string;
  gender: "" | "male" | "female";
  birthDate: string;
  heightCm: string;
  weightKg: string;
}

const EMPTY_FORM: ProfileForm = {
  name: "",
  gender: "",
  birthDate: "",
  heightCm: "",
  weightKg: "",
};

export function ProfileManager() {
  const utils = trpc.useUtils();
  const profilesQuery = trpc.profiles.list.useQuery();
  const profiles = profilesQuery.data ?? [];

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const createMutation = trpc.profiles.create.useMutation({
    onSuccess: () => {
      toast.success("成员已添加");
      utils.profiles.list.invalidate();
      setShowForm(false);
      setForm(EMPTY_FORM);
    },
    onError: (e) => toast.error(e.message || "添加失败"),
  });
  const updateMutation = trpc.profiles.update.useMutation({
    onSuccess: () => {
      toast.success("成员已更新");
      utils.profiles.list.invalidate();
      setEditingId(null);
      setForm(EMPTY_FORM);
    },
    onError: (e) => toast.error(e.message || "更新失败"),
  });
  const removeMutation = trpc.profiles.remove.useMutation({
    onSuccess: () => {
      toast.success("成员已删除，健康数据已保留");
      utils.profiles.list.invalidate();
    },
    onError: (e) => toast.error(e.message || "删除失败"),
  });

  const startCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const startEdit = (p: (typeof profiles)[number]) => {
    setShowForm(false);
    setEditingId(p.id);
    setForm({
      name: p.name,
      gender: (p.gender as ProfileForm["gender"]) ?? "",
      birthDate: p.birthDate ?? "",
      heightCm: p.heightCm != null ? String(p.heightCm) : "",
      weightKg: p.weightKg != null ? String(p.weightKg) : "",
    });
  };

  const cancel = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("姓名为必填项");
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        ...(form.gender && { gender: form.gender }),
        ...(form.birthDate && { birthDate: form.birthDate }),
        ...(form.heightCm && { heightCm: Number(form.heightCm) }),
        ...(form.weightKg && { weightKg: Number(form.weightKg) }),
      };
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, ...payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const remove = (p: (typeof profiles)[number]) => {
    if (
      window.confirm(
        `确定删除成员「${p.name}」吗？\n\n健康数据不会被删除，仅取消与该成员的归属关联。`,
      )
    ) {
      removeMutation.mutate({ id: p.id });
    }
  };

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-[15px] font-display font-semibold text-neutral-900">
            家庭成员档案
          </h3>
          <p className="text-[12px] text-neutral-500 font-body mt-0.5">
            上传报告时可选择归属成员
          </p>
        </div>
        {!showForm && !editingId && (
          <button
            onClick={startCreate}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-600 shadow-xs transition-all hover:border-accent-300 hover:text-accent-600 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            添加成员
          </button>
        )}
      </div>

      {/* 列表 */}
      {profiles.length > 0 && (
        <div className="divide-y divide-neutral-100">
          {profiles.map((p) => (
            <div key={p.id} className="flex items-center gap-3 py-3">
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white"
                style={{ backgroundColor: p.avatarColor ?? "#18a058" }}
              >
                {p.name.slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-neutral-900 truncate">
                    {p.name}
                  </span>
                  {p.isDefault && (
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-500">
                      默认
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-neutral-400 font-mono mt-0.5">
                  {p.gender === "male" ? "男" : p.gender === "female" ? "女" : ""}
                  {p.gender && p.birthDate ? " · " : ""}
                  {p.birthDate ?? ""}
                </div>
              </div>
              <button
                onClick={() => startEdit(p)}
                className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 cursor-pointer"
                title="编辑"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => remove(p)}
                disabled={removeMutation.isPending}
                className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-50 cursor-pointer"
                title="删除"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {profiles.length === 0 && !showForm && (
        <p className="py-6 text-center text-[13px] text-neutral-400">
          还没有成员档案，点击"添加成员"为家人建立档案
        </p>
      )}

      {/* 新增/编辑表单 */}
      {(showForm || editingId) && (
        <div className="mt-4 border-t border-neutral-100 pt-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-neutral-500">
                姓名 *
              </span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="如：爸爸"
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-neutral-500">
                性别
              </span>
              <select
                value={form.gender}
                onChange={(e) =>
                  setForm({ ...form, gender: e.target.value as ProfileForm["gender"] })
                }
                className={inputClass}
              >
                <option value="">不填</option>
                <option value="male">男</option>
                <option value="female">女</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-neutral-500">
                出生日期
              </span>
              <input
                type="date"
                value={form.birthDate}
                onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-neutral-500">
                身高（cm）
              </span>
              <input
                type="number"
                value={form.heightCm}
                onChange={(e) => setForm({ ...form, heightCm: e.target.value })}
                placeholder="170"
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-neutral-500">
                体重（kg）
              </span>
              <input
                type="number"
                value={form.weightKg}
                onChange={(e) => setForm({ ...form, weightKg: e.target.value })}
                placeholder="65"
                className={inputClass}
              />
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={save}
              disabled={isSaving}
              className={cn(
                "rounded-lg bg-accent-600 px-4 py-2 text-[13px] font-medium text-white shadow-sm transition-colors hover:bg-accent-700 disabled:opacity-50 cursor-pointer",
              )}
            >
              {isSaving ? "保存中…" : "保存"}
            </button>
            <button
              onClick={cancel}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[13px] font-medium text-neutral-600 transition-colors hover:bg-neutral-50 cursor-pointer"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
