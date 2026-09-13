"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { AlertTriangle, FileUp, Pencil, Trash2, Plus, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ModuleImportButton } from "@/components/health/module-import-button";
import { setActiveProfileCookie } from "@/components/settings/member-switcher";

const inputClass =
  "rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[13px] text-neutral-900 placeholder:text-neutral-400 focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100 transition-all";

interface ProfileForm {
  name: string;
  gender: "" | "male" | "female";
  birthDate: string;
  heightCm: string;
  weightKg: string;
  bloodType: string;
  allergies: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  primaryCareProvider: string;
  familyHistory: string;
}

const EMPTY_FORM: ProfileForm = {
  name: "",
  gender: "",
  birthDate: "",
  heightCm: "",
  weightKg: "",
  bloodType: "",
  allergies: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  primaryCareProvider: "",
  familyHistory: "",
};

export function ProfileManager() {
  const utils = trpc.useUtils();
  const profilesQuery = trpc.profiles.list.useQuery();
  const profiles = profilesQuery.data ?? [];

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [profilePendingDelete, setProfilePendingDelete] = useState<(typeof profiles)[number] | null>(null);
  const [deleteAction, setDeleteAction] = useState<"transfer" | "delete">("transfer");
  const [transferToProfileId, setTransferToProfileId] = useState("");
  const [confirmPermanentDeletion, setConfirmPermanentDeletion] = useState(false);
  const selectedSummary = trpc.profiles.summary.useQuery(
    { id: selectedProfileId! },
    { enabled: Boolean(selectedProfileId) },
  );
  const deletionPreview = trpc.profiles.deletionPreview.useQuery(
    { id: profilePendingDelete?.id ?? "00000000-0000-0000-0000-000000000000" },
    { enabled: Boolean(profilePendingDelete) },
  );

  const switchToProfile = (id: string) => {
    setActiveProfileCookie(id);
    toast.success("已切换健康档案");
    window.setTimeout(() => window.location.reload(), 150);
  };

  const createMutation = trpc.profiles.create.useMutation({
    onSuccess: (profile) => {
      setSelectedProfileId(profile.id);
      switchToProfile(profile.id);
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
      toast.success("成员档案已删除");
      utils.profiles.list.invalidate();
    },
    onError: (e) => toast.error(e.message || "删除失败"),
  });

  const startCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSelectedProfileId(null);
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
      bloodType: p.bloodType ?? "",
      allergies: p.allergies ?? "",
      emergencyContactName: p.emergencyContactName ?? "",
      emergencyContactPhone: p.emergencyContactPhone ?? "",
      primaryCareProvider: p.primaryCareProvider ?? "",
      familyHistory: p.familyHistory ?? "",
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
      const healthDetails = {
        bloodType: form.bloodType as "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-" | "",
        allergies: form.allergies.trim(),
        emergencyContactName: form.emergencyContactName.trim(),
        emergencyContactPhone: form.emergencyContactPhone.trim(),
        primaryCareProvider: form.primaryCareProvider.trim(),
        familyHistory: form.familyHistory.trim(),
      };
      const payload = {
        name: form.name.trim(),
        ...(form.gender && { gender: form.gender }),
        ...(form.birthDate && { birthDate: form.birthDate }),
        ...(form.heightCm && { heightCm: Number(form.heightCm) }),
        ...(form.weightKg && { weightKg: Number(form.weightKg) }),
      };
      if (editingId) {
        await updateMutation.mutateAsync({
          id: editingId,
          ...payload,
          bloodType: healthDetails.bloodType || null,
          allergies: healthDetails.allergies || null,
          emergencyContactName: healthDetails.emergencyContactName || null,
          emergencyContactPhone: healthDetails.emergencyContactPhone || null,
          primaryCareProvider: healthDetails.primaryCareProvider || null,
          familyHistory: healthDetails.familyHistory || null,
        });
      } else {
        await createMutation.mutateAsync({
          ...payload,
          ...(healthDetails.bloodType && { bloodType: healthDetails.bloodType }),
          ...(healthDetails.allergies && { allergies: healthDetails.allergies }),
          ...(healthDetails.emergencyContactName && { emergencyContactName: healthDetails.emergencyContactName }),
          ...(healthDetails.emergencyContactPhone && { emergencyContactPhone: healthDetails.emergencyContactPhone }),
          ...(healthDetails.primaryCareProvider && { primaryCareProvider: healthDetails.primaryCareProvider }),
          ...(healthDetails.familyHistory && { familyHistory: healthDetails.familyHistory }),
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async (p: (typeof profiles)[number]) => {
    try {
      const counts = await utils.profiles.deletionPreview.fetch({ id: p.id });
      toast.info(`将处理 ${counts.reports} 份报告、${counts.observations} 条指标、${counts.medications} 条用药、${counts.conditions} 条病史和 ${counts.encounters} 条就诊记录。`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "无法统计成员数据");
      return;
    }
    setDeleteAction("transfer");
    setTransferToProfileId(profiles.find((profile) => profile.isDefault)?.id ?? "");
    setConfirmPermanentDeletion(false);
    setProfilePendingDelete(p);
  };

  const confirmRemove = () => {
    if (!profilePendingDelete) return;
    removeMutation.mutate({
      id: profilePendingDelete.id,
      action: deleteAction,
      ...(deleteAction === "transfer" ? { transferToProfileId } : { confirmPermanentDeletion: true }),
    }, {
      onSuccess: () => {
        if (selectedProfileId === profilePendingDelete.id) setSelectedProfileId(null);
        setProfilePendingDelete(null);
      },
    });
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
            <button key={p.id} onClick={() => setSelectedProfileId(p.id)} className={`flex w-full items-center gap-3 rounded-lg px-1 py-3 text-left transition-colors ${selectedProfileId === p.id ? "bg-accent-50" : "hover:bg-neutral-50"}`}>
              <span className="flex size-9 shrink-0 items-center justify-center bg-neutral-200 text-accent-500">
                <UserRound className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-neutral-900 truncate">
                    {p.name}
                  </span>
                  {p.isDefault && (
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-500">
                      本人
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-neutral-400 font-mono mt-0.5">
                  {p.gender === "male" ? "男" : p.gender === "female" ? "女" : ""}
                  {p.gender && p.birthDate ? " · " : ""}
                  {p.birthDate ?? ""}
                </div>
              </div>
              <span className="text-[11px] text-neutral-400">查看档案</span>
            </button>
          ))}
        </div>
      )}

      {selectedProfileId && (
        <aside className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
          {selectedSummary.isLoading ? <p className="text-[13px] text-neutral-400">正在读取成员健康档案…</p> : selectedSummary.data && <>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center bg-neutral-200 text-accent-500"><UserRound className="size-4" /></span><div><h4 className="text-[14px] font-semibold text-neutral-900">{selectedSummary.data.profile.name} 的健康档案</h4><p className="mt-0.5 text-[11px] text-neutral-500">{selectedSummary.data.profile.isDefault ? "此档案对应当前登录账号本人。" : "选择此成员后，全站健康数据将按该档案显示。"}</p></div></div>
               {!selectedSummary.data.profile.isDefault && <button onClick={() => startEdit(selectedSummary.data!.profile)} className="rounded-lg border border-neutral-200 bg-white p-2 text-neutral-500 hover:text-accent-600" title="编辑档案"><Pencil className="size-3.5" /></button>}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">{[["报告", selectedSummary.data.counts.reports], ["指标", selectedSummary.data.counts.observations], ["用药", selectedSummary.data.counts.medications], ["病史", selectedSummary.data.counts.conditions], ["就诊", selectedSummary.data.counts.encounters]].map(([label, value]) => <div key={String(label)} className="rounded-lg bg-white px-2 py-2 text-center"><div className="text-[15px] font-semibold text-neutral-900">{value}</div><div className="text-[10px] text-neutral-400">{label}</div></div>)}</div>
            <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => switchToProfile(selectedProfileId)} className="inline-flex h-9 items-center gap-2 rounded-lg bg-neutral-900 px-3 text-[12px] font-medium text-white hover:bg-neutral-700"><UserRound className="size-3.5" />{selectedSummary.data.profile.isDefault ? "切换到本人档案" : "切换到此成员"}</button><ModuleImportButton profileId={selectedProfileId} label="导入健康报告" />{!selectedSummary.data.profile.isDefault && <button onClick={() => remove(selectedSummary.data!.profile)} disabled={removeMutation.isPending} className="inline-flex h-9 items-center gap-2 rounded-lg px-2 text-[12px] text-neutral-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="size-3.5" />删除</button>}</div>
            <div className="mt-4 border-t border-neutral-200 pt-3"><p className="mb-2 text-[11px] font-semibold text-neutral-500">最近健康报告</p>{selectedSummary.data.latestReports.length ? <div className="space-y-1.5">{selectedSummary.data.latestReports.map((report) => <div key={report.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-[11px] text-neutral-600"><span className="inline-flex items-center gap-1.5"><FileUp className="size-3 text-accent-600" />导入报告</span><span>{report.status}</span></div>)}</div> : <p className="text-[11px] leading-5 text-neutral-400">还没有报告。导入 PDF、图片或数据文件后，报告会归入此成员的档案。</p>}</div>
          </>}
        </aside>
      )}

      {profiles.length === 0 && !showForm && (
        <p className="py-6 text-center text-[13px] text-neutral-400">
          还没有成员档案，点击"添加成员"为家人建立档案
        </p>
      )}

      {/* 新增/编辑表单 */}
      {(showForm || editingId) && (
        <div className="relative z-10 mt-4 border-t border-neutral-100 pt-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
           <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-neutral-500">
                姓名 *
              </span>
              <input
                type="text"
                autoFocus
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="如：爸爸"
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-neutral-500">血型</span>
              <select value={form.bloodType} onChange={(e) => setForm({ ...form, bloodType: e.target.value })} className={inputClass}>
                <option value="">未设置</option>{["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-neutral-500">家庭医生</span>
              <input type="text" value={form.primaryCareProvider} onChange={(e) => setForm({ ...form, primaryCareProvider: e.target.value })} placeholder="姓名或机构" className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-3">
              <span className="text-[11px] font-semibold text-neutral-500">过敏史</span>
              <textarea value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })} placeholder="如：青霉素、花生。没有请留空。" className={inputClass} rows={2} />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-3">
              <span className="text-[11px] font-semibold text-neutral-500">家族史</span>
              <textarea value={form.familyHistory} onChange={(e) => setForm({ ...form, familyHistory: e.target.value })} placeholder="如：父亲高血压，母亲糖尿病。没有请留空。" className={inputClass} rows={2} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-neutral-500">紧急联系人</span>
              <input type="text" value={form.emergencyContactName} onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })} placeholder="姓名" className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-neutral-500">紧急联系电话</span>
              <input type="tel" value={form.emergencyContactPhone} onChange={(e) => setForm({ ...form, emergencyContactPhone: e.target.value })} placeholder="电话号码" className={inputClass} />
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
      {profilePendingDelete && <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="delete-profile-title"><button type="button" aria-label="取消删除" className="absolute inset-0 cursor-default bg-neutral-900/20 backdrop-blur-sm" onClick={() => setProfilePendingDelete(null)} /><div className="relative w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl"><div className="flex items-start justify-between gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-red-50 text-red-600"><AlertTriangle className="size-5" /></span><button type="button" onClick={() => setProfilePendingDelete(null)} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"><X className="size-4" /></button></div><h3 id="delete-profile-title" className="mt-4 text-[16px] font-semibold text-neutral-900">移除“{profilePendingDelete.name}”的档案？</h3><p className="mt-2 text-[13px] leading-6 text-neutral-500">为避免健康数据丢失，请先决定数据去向。</p><div className="mt-4 space-y-3 text-[13px]"><label className="flex gap-2"><input type="radio" checked={deleteAction === "transfer"} onChange={() => setDeleteAction("transfer")} /><span><b>转移数据并移除档案</b><br /><span className="text-neutral-500">报告、检验、用药、病史和就诊记录将归入接收档案。</span></span></label>{deleteAction === "transfer" && <select value={transferToProfileId} onChange={(e) => setTransferToProfileId(e.target.value)} className={`${inputClass} w-full`}>{profiles.filter((profile) => profile.id !== profilePendingDelete.id).map((profile) => <option key={profile.id} value={profile.id}>{profile.name}{profile.isDefault ? "（本人）" : ""}</option>)}</select>}<label className="flex gap-2"><input type="radio" checked={deleteAction === "delete"} onChange={() => setDeleteAction("delete")} /><span><b className="text-red-700">永久删除数据</b><br /><span className="text-neutral-500">此操作会删除该成员的健康记录，无法恢复。</span></span></label>{deleteAction === "delete" && <label className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-red-800"><input type="checkbox" checked={confirmPermanentDeletion} onChange={(e) => setConfirmPermanentDeletion(e.target.checked)} />我了解这会永久删除所有成员数据</label>}</div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setProfilePendingDelete(null)} className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[13px] font-medium text-neutral-600 hover:bg-neutral-50">取消</button><button type="button" onClick={confirmRemove} disabled={removeMutation.isPending || (deleteAction === "transfer" && !transferToProfileId) || (deleteAction === "delete" && !confirmPermanentDeletion)} className="rounded-lg bg-red-600 px-3 py-2 text-[13px] font-medium text-white hover:bg-red-700 disabled:opacity-50">{removeMutation.isPending ? "处理中…" : deleteAction === "transfer" ? "转移并移除" : "永久删除"}</button></div></div></div>}
    </div>
  );
}
