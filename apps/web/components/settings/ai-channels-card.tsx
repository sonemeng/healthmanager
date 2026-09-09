"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Pencil, Trash2, Plus, RefreshCw, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const inputClass =
  "rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[13px] text-neutral-900 placeholder:text-neutral-400 focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100 transition-all";

interface ChannelForm {
  name: string;
  protocol: "openai" | "anthropic";
  baseUrl: string;
  apiKey: string;
}

const EMPTY_FORM: ChannelForm = {
  name: "",
  protocol: "openai",
  baseUrl: "",
  apiKey: "",
};

export function AiChannelsCard() {
  const utils = trpc.useUtils();
  const channelsQuery = trpc.aiChannels.list.useQuery();
  const channels = channelsQuery.data ?? [];
  const prefsQuery = trpc.preferences.get.useQuery();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ChannelForm>(EMPTY_FORM);
  const [modelInput, setModelInput] = useState("");
  const [fetchingId, setFetchingId] = useState<string | null>(null);

  const createMutation = trpc.aiChannels.create.useMutation({
    onSuccess: () => {
      toast.success("渠道已添加");
      utils.aiChannels.list.invalidate();
      setShowForm(false);
      setForm(EMPTY_FORM);
    },
    onError: (e) => toast.error(e.message || "添加失败"),
  });
  const updateMutation = trpc.aiChannels.update.useMutation({
    onSuccess: () => {
      toast.success("渠道已更新");
      utils.aiChannels.list.invalidate();
      setEditingId(null);
      setForm(EMPTY_FORM);
    },
    onError: (e) => toast.error(e.message || "更新失败"),
  });
  const removeMutation = trpc.aiChannels.remove.useMutation({
    onSuccess: () => {
      toast.success("渠道已删除");
      utils.aiChannels.list.invalidate();
    },
    onError: (e) => toast.error(e.message || "删除失败"),
  });
  const setActiveMutation = trpc.aiChannels.setActive.useMutation({
    onSuccess: () => {
      toast.success("已切换使用渠道");
      utils.aiChannels.list.invalidate();
      utils.preferences.get.invalidate();
    },
    onError: (e) => toast.error(e.message || "切换失败"),
  });
  const fetchModelsMutation = trpc.aiChannels.fetchModels.useMutation({
    onSuccess: (data) => {
      toast.success(`拉取成功，共 ${data.models.length} 个模型`);
      utils.aiChannels.list.invalidate();
      setFetchingId(null);
    },
    onError: (e) => {
      toast.error(e.message || "拉取失败");
      setFetchingId(null);
    },
  });
  const saveModelMutation = trpc.preferences.update.useMutation({
    onSuccess: () => {
      toast.success("默认模型已保存");
      utils.preferences.get.invalidate();
    },
    onError: (e) => toast.error(e.message || "保存失败"),
  });

  const activeChannel = channels.find((c) => c.isActive);

  const startCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const startEdit = (c: (typeof channels)[number]) => {
    setShowForm(false);
    setEditingId(c.id);
    setForm({
      name: c.name,
      protocol: (c.protocol as ChannelForm["protocol"]) ?? "openai",
      baseUrl: c.baseUrl,
      apiKey: "", // 编辑留空 = 不修改
    });
  };

  const cancel = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("名称为必填项");
    if (!form.baseUrl.trim()) return toast.error("BaseURL 为必填项");
    if (!editingId && !form.apiKey.trim()) return toast.error("API Key 为必填项");
    if (editingId) {
      await updateMutation.mutateAsync({
        id: editingId,
        name: form.name.trim(),
        baseUrl: form.baseUrl.trim(),
        protocol: form.protocol,
        ...(form.apiKey.trim() && { apiKey: form.apiKey.trim() }),
      });
    } else {
      await createMutation.mutateAsync({
        name: form.name.trim(),
        baseUrl: form.baseUrl.trim(),
        apiKey: form.apiKey.trim(),
        protocol: form.protocol,
      });
    }
  };

  const saveModel = () => {
    const model = modelInput.trim() || prefsQuery.data?.aiModel;
    if (!model) return;
    saveModelMutation.mutate({ aiModel: model });
  };

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-[15px] font-display font-semibold text-neutral-900">
            AI 模型渠道
          </h3>
          <p className="text-[12px] text-neutral-500 font-body mt-0.5">
            配置 OpenAI 兼容中转站或 Anthropic 渠道，解析与 AI 分析将使用启用中的渠道
          </p>
        </div>
        {!showForm && !editingId && (
          <button
            onClick={startCreate}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-600 shadow-xs transition-all hover:border-accent-300 hover:text-accent-600 cursor-pointer shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            添加渠道
          </button>
        )}
      </div>

      {/* 渠道列表 */}
      <div className="space-y-2.5">
        {channels.map((c) => (
          <div
            key={c.id}
            className={cn(
              "rounded-xl border p-3.5 transition-colors",
              c.isActive
                ? "border-accent-300 bg-accent-50/40"
                : "border-neutral-200 bg-white",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-medium text-neutral-900">
                    {c.name}
                  </span>
                  {c.isActive && (
                    <span className="rounded-full bg-accent-600 px-2 py-0.5 text-[10px] font-medium text-white">
                      使用中
                    </span>
                  )}
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-500">
                    {c.protocol === "anthropic" ? "Anthropic 原生" : "OpenAI 兼容"}
                  </span>
                </div>
                <div className="text-[11px] text-neutral-400 font-mono mt-1 truncate">
                  {c.baseUrl} · {c.apiKeyMasked}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!c.isActive && (
                  <button
                    onClick={() => setActiveMutation.mutate({ id: c.id })}
                    className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-[11px] font-medium text-neutral-600 transition-colors hover:border-accent-300 hover:text-accent-600 cursor-pointer"
                  >
                    启用此渠道
                  </button>
                )}
                <button
                  onClick={() => {
                    setFetchingId(c.id);
                    fetchModelsMutation.mutate({ id: c.id });
                  }}
                  disabled={fetchingId === c.id}
                  className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 disabled:opacity-50 cursor-pointer"
                  title="拉取模型列表"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", fetchingId === c.id && "animate-spin")} />
                </button>
                <button
                  onClick={() => startEdit(c)}
                  className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 cursor-pointer"
                  title="编辑"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`确定删除渠道「${c.name}」吗？`)) {
                      removeMutation.mutate({ id: c.id });
                    }
                  }}
                  className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-500 cursor-pointer"
                  title="删除"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* 默认模型（仅启用中的渠道） */}
            {c.isActive && (
              <div className="mt-3 border-t border-neutral-100 pt-3">
                <div className="text-[11px] font-semibold text-neutral-500 mb-1.5">
                  默认模型
                </div>
                {(c.modelsCache?.length ?? 0) > 0 ? (
                  <select
                    value={prefsQuery.data?.aiModel ?? ""}
                    onChange={(e) => saveModelMutation.mutate({ aiModel: e.target.value })}
                    className={cn(inputClass, "w-full max-w-sm cursor-pointer")}
                  >
                    <option value="">选择模型…</option>
                    {c.modelsCache!.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={modelInput || prefsQuery.data?.aiModel || ""}
                      onChange={(e) => setModelInput(e.target.value)}
                      placeholder="如 gemini-2.0-flash"
                      className={cn(inputClass, "w-full max-w-sm")}
                    />
                    <button
                      onClick={saveModel}
                      disabled={saveModelMutation.isPending}
                      className="flex items-center gap-1 rounded-lg bg-accent-600 px-3 py-2 text-[12px] font-medium text-white transition-colors hover:bg-accent-700 disabled:opacity-50 cursor-pointer shrink-0"
                    >
                      <Check className="h-3 w-3" />
                      保存模型
                    </button>
                  </div>
                )}
                <p className="text-[11px] text-neutral-400 mt-1">
                  点渠道右侧的刷新图标可拉取模型列表
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      {channels.length === 0 && !showForm && (
        <p className="py-6 text-center text-[13px] text-neutral-400">
          还没有配置渠道，AI 解析将使用默认网关
        </p>
      )}

      {/* 新增/编辑表单 */}
      {(showForm || editingId) && (
        <div className="mt-4 border-t border-neutral-100 pt-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-neutral-500">名称 *</span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="如：我的中转站"
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-neutral-500">协议</span>
              <select
                value={form.protocol}
                onChange={(e) =>
                  setForm({ ...form, protocol: e.target.value as ChannelForm["protocol"] })
                }
                className={cn(inputClass, "cursor-pointer")}
              >
                <option value="openai">OpenAI 兼容</option>
                <option value="anthropic">Anthropic 原生</option>
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-neutral-500">BaseURL *</span>
            <input
              type="text"
              value={form.baseUrl}
              onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
              placeholder="如 https://api.example.com/v1"
              className={inputClass}
            />
            <span className="text-[11px] text-neutral-400">
              一般以 /v1 结尾
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-neutral-500">
              API Key {editingId ? "（留空 = 不修改）" : "*"}
            </span>
            <input
              type="password"
              value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              placeholder={editingId ? "••••••" : "sk-…"}
              className={inputClass}
            />
          </label>
          <div className="flex gap-2 pt-1">
            <button
              onClick={save}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="rounded-lg bg-accent-600 px-4 py-2 text-[13px] font-medium text-white shadow-sm transition-colors hover:bg-accent-700 disabled:opacity-50 cursor-pointer"
            >
              {createMutation.isPending || updateMutation.isPending ? "保存中…" : "保存"}
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
