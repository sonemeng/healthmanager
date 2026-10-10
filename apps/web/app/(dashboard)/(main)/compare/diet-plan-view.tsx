"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { downloadText } from "@/lib/export";
import { cn, formatDate } from "@/lib/utils";
import {
  Sparkles,
  Pencil,
  Save,
  History,
  FileDown,
  Eye,
  Utensils,
  Ban,
} from "lucide-react";

// AI 饮食清单视图（spec 17 §2）：生成 / 展示 / 编辑留痕 / 历史回看 / 导出。

type PlanItem = { name: string; level: string; amount?: string; reason?: string };
type PlanCategory = { category: string; label?: string; items: PlanItem[] };
type PlanForbidden = {
  type: string;
  item: string;
  reason?: string;
  relatedMetrics?: string[];
};
type DietPlanContent = {
  categories: PlanCategory[];
  forbidden?: PlanForbidden[];
};

const LEVEL_STYLES: Record<string, string> = {
  推荐: "bg-green-50 text-green-700 border-green-200",
  适量: "bg-blue-50 text-blue-700 border-blue-200",
  限制: "bg-amber-50 text-amber-700 border-amber-200",
  避免: "bg-red-50 text-red-700 border-red-200",
};
const LEVELS = ["推荐", "适量", "限制", "避免"];

function LevelBadge({ level }: { level: string }) {
  if (!level) {
    return (
      <span className="shrink-0 rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[10px] text-neutral-400">
        待 AI 评估
      </span>
    );
  }
  const style = LEVEL_STYLES[level] ?? "bg-neutral-50 text-neutral-600 border-neutral-200";
  return (
    <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium", style)}>
      {level}
    </span>
  );
}

// 导出 markdown（含免责声明）
function planToMarkdown(plan: DietPlanContent, disclaimer: string, batchDate: string): string {
  const lines: string[] = [
    "# HealthManager++ AI 饮食建议",
    "",
    `对应检查批次：${batchDate}`,
    "",
  ];
  for (const cat of plan.categories ?? []) {
    lines.push(`## ${cat.label ?? cat.category}`);
    lines.push("");
    for (const item of cat.items ?? []) {
      lines.push(
        `- **${item.name}**（${item.level}）${item.amount ? `｜${item.amount}` : ""}${item.reason ? `｜${item.reason}` : ""}`,
      );
    }
    lines.push("");
  }
  if (plan.forbidden?.length) {
    lines.push("## 禁止事项");
    lines.push("");
    for (const f of plan.forbidden) {
      lines.push(`- **[${f.type}] ${f.item}**${f.reason ? `：${f.reason}` : ""}${f.relatedMetrics?.length ? `（关联：${f.relatedMetrics.join("、")}）` : ""}`);
    }
    lines.push("");
  }
  lines.push("---");
  lines.push("");
  lines.push(`> ${disclaimer}`);
  return lines.join("\n");
}

export function DietPlanView() {
  const utils = trpc.useUtils();
  const { data: plans, isLoading: listLoading } = trpc.dietPlans.list.useQuery();

  // 选中存档：null = 未定制 → 取最新一条
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activeId = selectedId ?? plans?.[0]?.id ?? null;

  const { data: planRow } = trpc.dietPlans.get.useQuery(
    { id: activeId! },
    { enabled: !!activeId },
  );

  const generateMutation = trpc.dietPlans.generate.useMutation({
    onSuccess: (result) => {
      toast.success("AI 饮食建议已生成");
      utils.dietPlans.list.invalidate();
      setSelectedId(result.id);
      setShowOriginal(false);
      setEditingDraft(null);
    },
    onError: (e) => toast.error(e.message || "生成失败，请重试"),
  });
  const updateMutation = trpc.dietPlans.update.useMutation({
    onSuccess: () => {
      toast.success("修改已保存（生成原版保留可查）");
      utils.dietPlans.list.invalidate();
      utils.dietPlans.get.invalidate({ id: activeId! });
      setEditingDraft(null);
    },
    onError: (e) => toast.error(e.message || "保存失败，请重试"),
  });

  const [showOriginal, setShowOriginal] = useState(false);
  // 编辑草稿：非 null = 编辑模式中（深拷贝自显示版）
  const [editingDraft, setEditingDraft] = useState<DietPlanContent | null>(null);
  const [confirming, setConfirming] = useState(false);

  const contentJson = planRow?.contentJson as DietPlanContent | undefined;
  const editedJson = planRow?.editedJson as DietPlanContent | null | undefined;
  // 显示版：查看原版 → contentJson；否则编辑版优先
  const display: DietPlanContent | undefined =
    showOriginal ? contentJson : (editedJson ?? contentJson);
  // 编辑期间以草稿为准
  const shown = editingDraft ?? display;

  const isGenerating = generateMutation.isPending;

  const startEditing = () => {
    if (!display) return;
    setEditingDraft(JSON.parse(JSON.stringify(display)) as DietPlanContent);
  };

  const saveEditing = () => {
    if (!editingDraft || !activeId) return;
    // 清洗：剔除名称为空的手动增项行（避免误存空行）
    const cleaned: DietPlanContent = {
      ...editingDraft,
      categories: (editingDraft.categories ?? []).map((cat) => ({
        ...cat,
        items: (cat.items ?? []).filter((it) => it.name.trim().length > 0),
      })),
    };
    updateMutation.mutate({ id: activeId, editedJson: cleaned });
  };

  const exportMarkdown = () => {
    if (!shown || !planRow) return;
    downloadText(
      `healthmanager-diet-plan-${planRow.batchDate}`,
      planToMarkdown(shown, planRow.disclaimerText ?? "", planRow.batchDate),
      "text/markdown;charset=utf-8",
      "md",
    );
  };

  const editedNotice = planRow?.editedAt != null;

  if (listLoading) {
    return <div className="card h-32 animate-pulse bg-neutral-50" />;
  }

  // 无存档：引导生成
  if (!plans || plans.length === 0) {
    return (
      <div className="card px-5 py-8 text-center">
        <Utensils className="mx-auto size-5 text-neutral-300" />
        <p className="mt-3 text-[13px] font-medium text-neutral-700">
          还没有生成过饮食建议
        </p>
        <p className="mt-1 text-[12px] text-neutral-500">
          AI 将结合最新一次检查的全部指标、在用药物与过敏史，对预置候选食物池逐项给出推荐档位与食用量。
        </p>
        <div className="mt-4">
          {confirming ? (
            <div className="mx-auto flex max-w-md flex-col items-center gap-2">
              <p className="text-[12px] text-neutral-600">
                将读取该成员最新检查的全部指标、在用药物、过敏史与病史发送给 AI 渠道生成，约需 30–60 秒。
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirming(false)}
                  className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px] text-neutral-600 hover:bg-neutral-50"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    setConfirming(false);
                    generateMutation.mutate();
                  }}
                  disabled={isGenerating}
                  className="rounded-lg bg-accent-600 px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-accent-700 disabled:opacity-50"
                >
                  {isGenerating ? "生成中…约 1 分钟" : "确认生成"}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-4 py-2 text-[13px] font-medium text-white shadow-sm transition-colors hover:bg-accent-700"
            >
              <Sparkles className="size-3.5" />
              生成饮食建议
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      {/* 工具栏 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {plans.length > 1 && (
            <label className="flex items-center gap-1 text-[11px] text-neutral-500 font-mono">
              <History className="size-3" />
              历史
              <select
                value={activeId ?? ""}
                onChange={(e) => {
                  setSelectedId(e.target.value || null);
                  setShowOriginal(false);
                  setEditingDraft(null);
                }}
                className="rounded border border-neutral-200 bg-white px-2 py-1 text-[11px]"
              >
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.batchDate} · {formatDate(p.generatedAt)}
                    {p.editedAt ? "（已编辑）" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          {plans.length === 1 && planRow && (
            <span className="text-[11px] text-neutral-400 font-mono">
              {planRow.batchDate} · 生成于 {formatDate(planRow.generatedAt)} · {planRow.model}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {editedNotice && !editingDraft && (
            <button
              onClick={() => setShowOriginal((v) => !v)}
              className="flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-1 text-[11px] text-neutral-600 hover:border-accent-300 hover:text-accent-600"
            >
              <Eye className="size-3" />
              {showOriginal ? "查看编辑版" : "查看生成原版"}
            </button>
          )}
          {editingDraft ? (
            <>
              <button
                onClick={() => setEditingDraft(null)}
                className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-[11px] text-neutral-600 hover:bg-neutral-50"
              >
                取消编辑
              </button>
              <button
                onClick={saveEditing}
                disabled={updateMutation.isPending}
                className="flex items-center gap-1 rounded-md bg-accent-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-accent-700 disabled:opacity-50"
              >
                <Save className="size-3" />
                {updateMutation.isPending ? "保存中…" : "保存修改"}
              </button>
            </>
          ) : (
            <button
              onClick={startEditing}
              className="flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-1 text-[11px] text-neutral-600 hover:border-accent-300 hover:text-accent-600"
            >
              <Pencil className="size-3" />
              编辑清单
            </button>
          )}
          <button
            onClick={exportMarkdown}
            className="flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-1 text-[11px] text-neutral-600 hover:border-accent-300 hover:text-accent-600"
          >
            <FileDown className="size-3" />
            导出
          </button>
          <button
            onClick={() => {
              setConfirming(true);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            disabled={isGenerating}
            className="flex items-center gap-1 rounded-md bg-accent-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-accent-700 disabled:opacity-50"
          >
            <Sparkles className="size-3" />
            {isGenerating ? "生成中…" : "重新生成"}
          </button>
        </div>
      </div>

      {/* 重新生成确认条 */}
      {confirming && (
        <div className="border-b border-neutral-100 bg-accent-50/60 px-5 py-3">
          <p className="text-[12px] text-neutral-700">
            将读取该成员最新检查的全部指标、在用药物、过敏史与病史发送给 AI 渠道生成新的清单（历史版本保留可回看），约需 30–60 秒。
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-[12px] text-neutral-600 hover:bg-neutral-50"
            >
              取消
            </button>
            <button
              onClick={() => {
                setConfirming(false);
                generateMutation.mutate();
              }}
              disabled={isGenerating}
              className="rounded-lg bg-accent-600 px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-accent-700 disabled:opacity-50"
            >
              {isGenerating ? "生成中…约 1 分钟" : "确认生成"}
            </button>
          </div>
        </div>
      )}

      {/* 免责声明 */}
      {planRow?.disclaimerText && (
        <div className="border-b border-amber-100 bg-amber-50/70 px-5 py-2.5 text-[11px] leading-relaxed text-amber-800">
          {planRow.disclaimerText}
        </div>
      )}

      {/* 内容 */}
      {!shown ? (
        <div className="px-5 py-10 text-center text-[12px] text-neutral-400">
          加载清单内容…
        </div>
      ) : (
        <div className="divide-y divide-neutral-100">
          {/* 食物分类（表格样式） */}
          {(shown.categories ?? []).map((cat) => (
            <section key={cat.category} className="px-5 py-4">
              <h3 className="mb-2 text-[13px] font-semibold text-neutral-800 font-body">
                {cat.label ?? cat.category}
                <span className="ml-2 text-[10px] text-neutral-400 font-mono">
                  {cat.items?.length ?? 0} 项
                </span>
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse">
                  <thead>
                    <tr className="border-b border-neutral-200 bg-neutral-50">
                      {["食物", "推荐程度", "食用量", "说明"].map((h, i) => (
                        <th
                          key={h}
                          className={cn(
                            "px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] font-mono text-neutral-400",
                            i === 0 && "w-[22%] text-left",
                            i === 1 && "w-[9%] text-center",
                            i === 2 && "w-[26%] text-left",
                            i === 3 && "text-left",
                          )}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(cat.items ?? []).map((item, idx) => {
                      const key = `${cat.category}-${item.name}-${idx}`;
                      // 用户新增行（level 为空标记）：只填名称，档位/食用量/说明由 AI 下次生成时补全
                      const isNewCustomRow = editingDraft != null && item.level === "";
                      if (editingDraft) {
                        return (
                          <tr key={key} className="border-b border-neutral-100 last:border-b-0">
                            <td className="px-2 py-1.5">
                              <input
                                value={item.name}
                                onChange={(e) => {
                                  item.name = e.target.value;
                                  setEditingDraft({ ...editingDraft });
                                }}
                                placeholder="食物名（只需填名称）"
                                className="w-full rounded border border-neutral-200 bg-white px-2 py-1 text-[12px] font-medium"
                              />
                            </td>
                            {isNewCustomRow ? (
                              <>
                                <td colSpan={3} className="px-3 py-1.5 text-[11px] text-neutral-400">
                                  档位、食用量与说明由 AI 在下次生成时评估补全
                                </td>
                              </>
                            ) : (
                              <>
                            <td className="px-3 py-1.5 text-center">
                              <select
                                value={item.level}
                                onChange={(e) => {
                                  item.level = e.target.value;
                                  setEditingDraft({ ...editingDraft });
                                }}
                                className="rounded border border-neutral-200 bg-white px-1.5 py-1 text-[11px]"
                              >
                                {LEVELS.map((l) => (
                                  <option key={l} value={l}>{l}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                value={item.amount ?? ""}
                                onChange={(e) => {
                                  item.amount = e.target.value;
                                  setEditingDraft({ ...editingDraft });
                                }}
                                placeholder="食用量"
                                className="w-full rounded border border-neutral-200 bg-white px-2 py-1 text-[11px]"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                value={item.reason ?? ""}
                                onChange={(e) => {
                                  item.reason = e.target.value;
                                  setEditingDraft({ ...editingDraft });
                                }}
                                placeholder="说明"
                                className="w-full rounded border border-neutral-200 bg-white px-2 py-1 text-[11px]"
                              />
                            </td>
                              </>
                            )}
                          </tr>
                        );
                      }
                      return (
                        <tr key={key} className="border-b border-neutral-100 transition-colors last:border-b-0 hover:bg-neutral-50">
                          <td className="px-3 py-1.5 text-[12px] font-medium text-neutral-800">
                            {item.name}
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <LevelBadge level={item.level} />
                          </td>
                          <td className="px-3 py-1.5 text-[12px] text-neutral-700">
                            {item.amount || "—"}
                          </td>
                          <td className="px-3 py-1.5 text-[12px] text-neutral-500">
                            {item.reason || "—"}
                          </td>
                        </tr>
                      );
                    })}
                    {editingDraft && (
                      <tr>
                        <td colSpan={4} className="px-3 py-1.5">
                          <button
                            onClick={() => {
                              cat.items = [
                                ...(cat.items ?? []),
                                { name: "", level: "", amount: "", reason: "" },
                              ];
                              setEditingDraft({ ...editingDraft });
                            }}
                            className="flex items-center gap-1 rounded border border-dashed border-neutral-300 px-2.5 py-1 text-[11px] text-neutral-500 transition-colors hover:border-accent-300 hover:text-accent-600"
                          >
                            + 添加食物（只需填名称，AI 下次生成时补全档位与说明）
                          </button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ))}

          {/* 禁止事项 */}
          {shown.forbidden && shown.forbidden.length > 0 && (
            <section className="px-5 py-4">
              <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-neutral-800 font-body">
                <Ban className="size-3.5 text-red-500" />
                禁止事项
              </h3>
              <div className="space-y-1.5">
                {shown.forbidden.map((f, idx) => (
                  <div
                    key={`${f.item}-${idx}`}
                    className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 rounded border border-red-100 bg-red-50/40 px-3 py-2 text-[12px] sm:grid-cols-[auto_auto_1fr]"
                  >
                    <span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                      {f.type}
                    </span>
                    <span className="font-medium text-red-900">{f.item}</span>
                    <span className="col-span-2 text-neutral-600 sm:col-span-1">
                      {f.reason}
                      {f.relatedMetrics?.length ? (
                        <span className="text-neutral-400">（关联：{f.relatedMetrics.join("、")}）</span>
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {editedNotice && !editingDraft && (
            <div className="px-5 py-2 text-[10px] text-neutral-400 font-mono">
              本清单最后编辑于 {formatDate(planRow!.editedAt!)}；生成原版已保留，可随时切换查看。
            </div>
          )}
        </div>
      )}
    </div>
  );
}
