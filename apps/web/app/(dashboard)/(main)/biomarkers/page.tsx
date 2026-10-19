"use client";

import { Suspense, useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { TitleActionHeader } from "@/components/title-action-header";
import { AnimatedEmptyState } from "@/components/animated-empty-state";
import { StatusBadge } from "@/components/health/status-badge";
import { RangeSourceBadge } from "@/components/health/range-source-badge";
import { ClaimCitationModal } from "@/components/health/claim-citation-modal";
import { useModal } from "@/components/modal/provider";
import { CategoryNav, type CategoryNavItem } from "@/components/category-nav";
import { CATEGORY_META, CATEGORY_ORDER } from "@/lib/biomarker-categories";
import {
  Search,
  ChevronDown,
  ListChecks,
  Dna,
  Activity,
  Beaker,
  FlaskConical,
  Microscope,
  CheckCheck,
} from "lucide-react";
import { StyledIcon } from "@/components/styled-icon";

const emptyIcons = [
  ListChecks,
  Dna,
  Activity,
  Beaker,
  FlaskConical,
  Microscope,
];

function formatRange(
  low: number | null,
  high: number | null,
  unit: string | null,
): string {
  const u = unit ?? "";
  // 连接符用「~」与全站共享版一致（en-dash 在部分中文字体下显示异常）
  if (low != null && high != null) return `${low}~${high} ${u}`.trim();
  if (low != null) return `> ${low} ${u}`.trim();
  if (high != null) return `< ${high} ${u}`.trim();
  return "—";
}

const SEX_LABELS: Record<string, string> = { male: "男", female: "女" };

// 来源等级排名（与 packages/ingestion/src/normalizer.ts 的 SOURCE_TIER_RANK 一致）：
// 同一性别有多行时只取等级最高的一行做"默认区间"展示，避免同一性别显示两条互斥数值。
const TIER_RANK: Record<string, number> = {
  national_standard: 0,
  guideline: 1,
  textbook: 2,
  instrument: 3,
  lab_learned: 4,
  unverified: 5,
};

/**
 * 「来源待补」判据（spec 21 §15.6 N7 / §15.7 S5.1 R8）：三条件**联合**。
 *
 * 只看 `citation` 空会把 47 条 `auto_*` 字典条目 + 92 条学习行（它们的可追溯性靠
 * `observation_id`）一起拖进待办；只看 `tier` 则 30 条归位（exempt）后仍天天报。
 * 必须与 `audit-metric-dictionary.ts` 的 `isClaimPending()` 完全一致，
 * 否则页面计数与校验器数字对不上（§15.6 N4：数字只能由机制产出）。
 */
function isClaimPending(row: {
  sourceTier?: string | null;
  citation?: string | null;
  citationKind?: string | null;
}): boolean {
  return (
    row.sourceTier === 'unverified' && !row.citation && !row.citationKind
  );
}

type RangeRow = {
  id?: number | null;
  sex: string | null;
  ageMin: number | null;
  ageMax: number | null;
  rangeLow: number | null;
  rangeHigh: number | null;
  unit: string | null;
  sourceTier?: string | null;
  source?: string | null;
  citation?: string | null;
  citationKind?: string | null;
  verifiedAt?: Date | string | null;
};

/**
 * 默认参考区间列（spec 21 §4.5）：有分性别基准行时合并显示「男 40~50 · 女 35~45」。
 *
 * 为什么必须合并：字典基准列（metric_definitions.reference_range_low/high）只是
 * **不分性别的兜底值**，与 reference_ranges 里的分性别国标并存时会被读成"字典写错了"
 * （spec 21 §1.3.1 用户追问的源头）。把男女两行摆在同一格，口径一眼可辨。
 *
 * 口径：只取「基准单位行（unit 为 NULL）+ 有性别 + 无年龄分层」的行，
 * 每个性别按来源等级取最高、同等级取 id 最小的一条；学习行（unit 非 NULL）
 * 单位口径不同，不参与"默认"展示。
 */
function pickBestSexRanges(ranges: RangeRow[]): Array<[string, RangeRow]> {
  const bySex = new Map<string, RangeRow>();
  const rank = (r: RangeRow) => TIER_RANK[r.sourceTier ?? "unverified"] ?? 9;

  for (const r of ranges) {
    if (r.unit != null) continue;
    if (!r.sex) continue;
    if (r.ageMin != null || r.ageMax != null) continue;
    const cur = bySex.get(r.sex);
    if (
      !cur ||
      rank(r) < rank(cur) ||
      (rank(r) === rank(cur) && (r.id ?? 0) < (cur.id ?? 0))
    ) {
      bySex.set(r.sex, r);
    }
  }

  const ordered = ["male", "female"].filter((s) => bySex.has(s));
  for (const s of bySex.keys()) if (!ordered.includes(s)) ordered.push(s);
  return ordered.map((s) => [s, bySex.get(s)!]);
}

// 来源分组（spec 19 §3.4 + 2026-10-12 用户拍板 + spec 21 §15.5.3 / N2 改为读 source_tier）。
//
// 旧实现按 `source` 字符串猜等级，兜底一律 `{ order: 1, label: "指南/平台口径" }`：
// 把「镜检法通行（教材）」「流式仪器法通行（仪器）」「中国医药信息查询平台（商业网站）」
// 三种完全不同的等级全盖成「指南级」，还因 order:1 排在「通行口径」（order 2）之前——
// 「网站 ≥ 指南」的升格从字符串分支里长出来。
//
// 新实现**优先读 `source_tier`**（数据已有），`source` 只用于展示原文；
// unverified 单列一档「来源待补」。这样等级由数据决定，不再靠字符串猜。
function sourceGroup(
  source: string | null,
  tier?: string | null,
): { order: number; label: string } {
  switch (tier) {
    case 'national_standard':
      return { order: 0, label: "国家标准" };
    case 'guideline':
      return { order: 1, label: "指南" };
    case 'textbook':
      return { order: 2, label: "教材" };
    case 'instrument':
      // 检验结果互认标识（陕HR/晋HR…）也归此档：来源列显示标识本身
      return { order: 3, label: source && /HR$/.test(source) ? "检验结果互认（报告单标识）" : "仪器/方法通行口径" };
    case 'lab_learned':
      return { order: 4, label: "检验科区间（报告单学习）" };
    case 'user_input':
      return { order: 5, label: "手工补录" };
    case 'unverified':
      return { order: 9, label: "来源待补" };
  }
  // 无 tier 的历史数据：退回按 source 字符串的粗略归类（兜底不再升格为「指南」）
  if (source?.startsWith("WS/T")) return { order: 0, label: "国家标准" };
  if (source === "通行口径") return { order: 2, label: "教材" };
  if (source === "检验科区间")
    return { order: 4, label: "检验科区间（报告单学习）" };
  if (source && /HR$/.test(source))
    return { order: 3, label: "检验结果互认（报告单标识）" };
  return { order: 8, label: "其他" };
}

// 方法依赖项（spec 19 附录 ➖ 类）：无通行国标、检验系统各不相同——统一标「以报告单为准」
const METHOD_DEPENDENT = new Set([
  "tsh", "free_t3", "free_t4", "total_t3", "total_t4", "tpo_antibodies", "reverse_t3",
  "ck_mb", "troponin_i", "bnp", "free_testosterone", "dhea_s", "leptin", "oxidized_ldl",
  "ca199", "ca153", "cholinesterase", "rdw_sd", "fructosamine", "lipase",
  "bun_creatinine_ratio", "vldl_cholesterol", "ldl_particle_number", "shbg", "amh", "igf_1",
]);

// 月经周期分期激素（spec 19 §9-⑥）：单一区间会造成错判，区间不进判定列，展示分期口径
const CYCLE_PHASE_METRICS = new Set(["fsh", "lh", "estradiol", "progesterone"]);

export default function BiomarkersPage() {
  // useSearchParams 需要 Suspense 边界（Next App Router 构建要求，compare 页同款）
  return (
    <Suspense fallback={null}>
      <BiomarkersPageInner />
    </Suspense>
  );
}

function BiomarkersPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const modal = useModal();
  // 来源待补筛选视图（spec 21 §15.7 S5.2）：深链 ?claim=unverified
  const claimMode = searchParams.get("claim") === "unverified";
  const { data: metrics, isLoading: metricsLoading } =
    trpc.metrics.list.useQuery();
  const { data: ranges, isLoading: rangesLoading } =
    trpc.metrics.referenceRanges.useQuery();
  const { data: prefs } = trpc.preferences.get.useQuery();

  const [search, setSearch] = useState("");
  const [expandedMetric, setExpandedMetric] = useState<string | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set(),
  );
  const [activeCategory, setActiveCategory] = useState<string>(
    CATEGORY_ORDER[0],
  );
  const observerRef = useRef<IntersectionObserver | null>(null);
  const isScrollingRef = useRef(false);

  const isLoading = metricsLoading || rangesLoading;

  const allMetrics = metrics ?? [];
  const allRanges = ranges ?? [];

  // 来源待补清单（spec 21 §15.7 S5.2）：页面计数与校验器 R8 必须同源同判据。
  // 字典条目与区间行分开计——前者点「已核对」写 metric_definitions，
  // 后者写 reference_ranges，两条链路不能混。
  const pendingMetrics = useMemo(
    () => allMetrics.filter((m) => isClaimPending(m)),
    [allMetrics],
  );
  const pendingRanges = useMemo(
    () => allRanges.filter((r) => isClaimPending(r)),
    [allRanges],
  );
  const pendingRangeCount = pendingRanges.length;
  const pendingTotal = pendingMetrics.length + pendingRangeCount;

  // 有区间待补的指标集合：筛选视图里要连这些指标一起列出来，
  // 否则「4 条区间待补」在页面上无处可点（区间行藏在展开面板里）。
  const pendingRangeMetricCodes = useMemo(
    () => new Set(pendingRanges.map((r) => r.metricCode)),
    [pendingRanges],
  );

  // Group ranges by metric code
  const rangesByMetric = useMemo(() => {
    const map = new Map<string, typeof allRanges>();
    for (const r of allRanges) {
      const existing = map.get(r.metricCode) ?? [];
      existing.push(r);
      map.set(r.metricCode, existing);
    }
    return map;
  }, [allRanges]);

  // Filter by search（先套 claim 视图，再套关键词；两者可叠加）
  const lower = search.toLowerCase().trim();
  const claimScoped = claimMode
    ? allMetrics.filter(
        (m) => isClaimPending(m) || pendingRangeMetricCodes.has(m.id),
      )
    : allMetrics;
  const filtered = lower
    ? claimScoped.filter(
        (m) =>
          m.name.toLowerCase().includes(lower) ||
          m.id.toLowerCase().includes(lower) ||
          m.category.toLowerCase().includes(lower) ||
          m.aliases.some((a: string) => a.toLowerCase().includes(lower)),
      )
    : claimScoped;

  // 按分类分组
  const byCategory = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const m of filtered) {
      const existing = map.get(m.category) ?? [];
      existing.push(m);
      map.set(m.category, existing);
    }
    return map;
  }, [filtered]);

  // Sorted category keys
  const sortedCategories = useMemo(
    () =>
      [...byCategory.keys()].sort(
        (a, b) =>
          (CATEGORY_ORDER.indexOf(a as (typeof CATEGORY_ORDER)[number]) === -1
            ? 999
            : CATEGORY_ORDER.indexOf(a as (typeof CATEGORY_ORDER)[number])) -
          (CATEGORY_ORDER.indexOf(b as (typeof CATEGORY_ORDER)[number]) === -1
            ? 999
            : CATEGORY_ORDER.indexOf(b as (typeof CATEGORY_ORDER)[number])),
      ),
    [byCategory],
  );

  // Build nav items
  const navCategories: CategoryNavItem[] = useMemo(
    () =>
      sortedCategories
        .map((cat) => {
          const meta = CATEGORY_META[cat];
          if (!meta) return null;
          return {
            id: cat,
            label: meta.label,
            icon: meta.icon,
            count: byCategory.get(cat)?.length ?? 0,
          };
        })
        .filter((c): c is CategoryNavItem => c !== null),
    [sortedCategories, byCategory],
  );

  // Intersection observer for active category tracking
  useEffect(() => {
    observerRef.current?.disconnect();

    const observer = new IntersectionObserver(
      (entries) => {
        if (isScrollingRef.current) return;
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const cat = entry.target.id.replace("biomarker-cat-", "");
            setActiveCategory(cat);
            break;
          }
        }
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );

    observerRef.current = observer;

    for (const cat of sortedCategories) {
      const el = document.getElementById(`biomarker-cat-${cat}`);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [sortedCategories]);

  const handleCategoryClick = useCallback((category: string) => {
    const el = document.getElementById(`biomarker-cat-${category}`);
    if (el) {
      isScrollingRef.current = true;
      setActiveCategory(category);
      el.scrollIntoView({ behavior: "smooth", block: "start" });

      // Re-enable observer after scroll settles
      let scrollTimer: ReturnType<typeof setTimeout>;
      const onScroll = () => {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
          isScrollingRef.current = false;
          window.removeEventListener("scroll", onScroll);
        }, 100);
      };
      window.addEventListener("scroll", onScroll);
    }
  }, []);

  const toggleCategory = useCallback((category: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }, []);

  if (isLoading) {
    return (
      <div>
        <TitleActionHeader title="生物标志物" subtitle="加载中…" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card h-16 animate-pulse bg-neutral-50" />
          ))}
        </div>
      </div>
    );
  }

  if (allMetrics.length === 0) {
    return (
      <div>
        <TitleActionHeader
          title="生物标志物"
          subtitle="指标定义与参考区间。"
        />
        <div className="mt-7">
          <AnimatedEmptyState
            title="暂无指标定义"
            description="Run db:seed to populate metric definitions and reference ranges."
            cardIcon={({ index }) => emptyIcons[index % emptyIcons.length]!}
          />
        </div>
      </div>
    );
  }

  const userSex = prefs?.biologicalSex ?? null;
  const subtitle = `${allMetrics.length} metrics · ${allRanges.length} reference ranges${userSex ? ` · Profile: ${userSex}` : ""}`;

  return (
    <div>
      <TitleActionHeader title="生物标志物" subtitle={subtitle} />

      {/* Search + 来源待补筛选（spec 21 §15.7 S5.2） */}
      <div className="mt-7 mb-6 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索指标、别名或分类…"
            className="w-full rounded-lg border border-neutral-200 bg-white py-2.5 pl-10 pr-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100 transition-all"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            const next = new URLSearchParams(searchParams.toString());
            if (claimMode) next.delete("claim");
            else next.set("claim", "unverified");
            const qs = next.toString();
            router.replace(qs ? `${pathname}?${qs}` : pathname);
          }}
          title="只看来源待补的指标与区间"
          className={cn(
            "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2.5 text-[12px] font-medium font-body transition-all",
            claimMode
              ? "border-amber-300 bg-amber-50 text-amber-700"
              : pendingTotal > 0
                ? "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:text-neutral-900"
                : "border-neutral-200 bg-white text-neutral-400",
          )}
        >
          <CheckCheck className="size-3.5" />
          来源待补 {pendingTotal}
        </button>
      </div>

      {claimMode && (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3">
          <div className="text-[13px] font-medium text-amber-800 font-body">
            来源待补 {pendingTotal} 项（字典 {pendingMetrics.length} · 区间{" "}
            {pendingRangeCount}）
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-amber-700/90 font-body">
            逐条点「已核对」补一句依据即可——保存后初审不再报它，这个数字会自己变小。
            区间行在展开面板里，可直接核对。
          </p>
        </div>
      )}

      {filtered.length === 0 ? (
        claimMode && pendingTotal === 0 ? (
          <AnimatedEmptyState
            title="来源已全部核对"
            description="当前没有「来源待补」的指标或区间。新导入的数据若带来未核验来源，会自动出现在这里。"
            cardIcon={({ index }) => emptyIcons[index % emptyIcons.length]!}
          />
        ) : (
          <AnimatedEmptyState
            title="没有找到相关结果"
            description={
              search
                ? `没有与「${search}」匹配的指标，换个关键词试试。`
                : "当前筛选条件下没有条目。"
            }
            cardIcon={({ index }) => emptyIcons[index % emptyIcons.length]!}
          />
        )
      ) : (
        <>
          {/* Mobile pill nav */}
          <div className="lg:hidden mb-4">
            <CategoryNav
              variant="pills"
              categories={navCategories}
              activeCategory={activeCategory}
              onCategoryClick={handleCategoryClick}
              className="static mx-0 px-0 border-0 bg-transparent"
            />
          </div>

          {/* Desktop: sidebar + content */}
          <div className="lg:grid lg:grid-cols-[200px_1fr] lg:gap-10">
            <div className="hidden lg:block">
              <CategoryNav
                variant="sidebar"
                categories={navCategories}
                activeCategory={activeCategory}
                onCategoryClick={handleCategoryClick}
              />
            </div>

            <div className="space-y-3">
              {sortedCategories.map((cat) => {
                const catMetrics = byCategory.get(cat)!;
                const meta = CATEGORY_META[cat];
                const IconComponent = meta?.icon ?? ListChecks;
                const label = meta?.label ?? cat;

                const isCategoryCollapsed = collapsedCategories.has(cat);

                return (
                  <div
                    key={cat}
                    id={`biomarker-cat-${cat}`}
                    className="card scroll-mt-20"
                  >
                    {/* Category header */}
                    <button
                      type="button"
                      onClick={() => toggleCategory(cat)}
                      className="group flex w-full cursor-pointer items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-neutral-50"
                    >
                      <StyledIcon
                        icon={IconComponent}
                        className="group-hover:bg-accent-100 transition-colors"
                      />

                      <div className="flex-1">
                        <div className="text-[15px] font-semibold text-neutral-900 font-body">
                          {label}
                        </div>
                        <div className="mt-0.5 text-[11px] text-neutral-400 font-mono">
                          {catMetrics.length} metric
                          {catMetrics.length !== 1 ? "s" : ""}
                        </div>
                      </div>
                      <ChevronDown
                        className={cn(
                          "size-4 text-neutral-400 transition-transform",
                          isCategoryCollapsed && "-rotate-90",
                        )}
                      />
                    </button>

                    <div
                      className={cn(
                        "grid transition-[grid-template-rows] duration-200 ease-in-out",
                        isCategoryCollapsed
                          ? "grid-rows-[0fr]"
                          : "grid-rows-[1fr]",
                      )}
                    >
                      <div className="overflow-hidden">
                        {/* Header row */}
                        <div className="grid grid-cols-[1.6fr_1fr_1.4fr_0.8fr] gap-3 border-t border-b border-neutral-200 bg-neutral-50 px-5 py-2.5">
                          {["指标", "单位", "默认参考区间", "别名"].map(
                            (h) => (
                              <div
                                key={h}
                                className="text-[11px] font-semibold uppercase tracking-[0.04em] text-neutral-400 font-mono"
                              >
                                {h}
                              </div>
                            ),
                          )}
                        </div>

                        {/* Metric rows */}
                        {catMetrics.map((m) => {
                          const metricRanges = [...(rangesByMetric.get(m.id) ?? [])]
                            .sort((a, b) => {
                              const ga = sourceGroup(a.source, a.sourceTier);
                              const gb = sourceGroup(b.source, b.sourceTier);
                              if (ga.order !== gb.order) return ga.order - gb.order;
                              return (a.id ?? 0) - (b.id ?? 0);
                            });
                          const hasDemographicRanges = metricRanges.length > 0;
                          const isMetricExpanded = expandedMetric === m.id;
                          const aliasList = m.aliases.slice(0, 4);
                          const moreAliases =
                            m.aliases.length > 4 ? m.aliases.length - 4 : 0;
                          const isMethodDependent = METHOD_DEPENDENT.has(m.id);
                          const isCyclePhase = CYCLE_PHASE_METRICS.has(m.id);
                          // 该指标「最高等级区间」的来源徽标（spec 21 §15.5.2）：
                          // 有区间行 → 取排序后第一条（sourceGroup 升序 = 等级最高）的 tier；
                          // 无区间行 → 用字典条目自身的 tier（无行时无行级 citation，看字典的）。
                          // 待补判据（三条件联合）：tier=unverified 且无 citationKind。
                          const bestRange = metricRanges[0];
                          const badgeTier = (bestRange?.sourceTier ?? m.sourceTier ?? null) as string | null;
                          const badgeCitationKind =
                            bestRange
                              ? (bestRange.citationKind ?? null)
                              : (m.citationKind ?? null);
                          const badgeCitation = bestRange ? (bestRange.citation ?? null) : (m.citation ?? null);
                          const badgeVerifiedAt = bestRange ? (bestRange.verifiedAt ?? null) : (m.verifiedAt ?? null);

                          return (
                            <div key={m.id}>
                              <div
                                className="grid grid-cols-[1.6fr_1fr_1.4fr_0.8fr] items-center gap-3 border-b border-neutral-100 px-5 py-3.5 transition-colors hover:bg-neutral-50 cursor-pointer"
                                onClick={() =>
                                  setExpandedMetric(
                                    isMetricExpanded ? null : m.id,
                                  )
                                }
                              >
                                {/* Name + description */}
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-medium text-neutral-900 font-body">
                                      {m.name}
                                    </span>
                                    {hasDemographicRanges && (
                                      <StatusBadge
                                        status="info"
                                        label={`${metricRanges.length} range${metricRanges.length !== 1 ? "s" : ""}`}
                                      />
                                    )}
                                    {isMethodDependent && (
                                      <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500">
                                        以报告单为准
                                      </span>
                                    )}
                                    {isCyclePhase && (
                                      <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500">
                                        月经周期分期
                                      </span>
                                    )}
                                    {claimMode && isClaimPending(m) && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          modal.show(
                                            <ClaimCitationModal
                                              target="metric"
                                              id={m.id}
                                              name={m.name}
                                              metricCode={m.id}
                                            />,
                                          );
                                        }}
                                        className="inline-flex cursor-pointer items-center gap-1 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 transition-colors hover:bg-amber-100"
                                      >
                                        <CheckCheck className="size-3" />
                                        已核对
                                      </button>
                                    )}
                                  </div>
                                  {m.description && (
                                    <div className="mt-0.5 text-[11px] text-neutral-400 font-mono">
                                      {m.description}
                                    </div>
                                  )}
                                </div>

                                {/* Unit */}
                                <div className="text-xs text-neutral-600 font-mono">
                                  {m.unit ?? "—"}
                                </div>

                                {/* 默认区间：有分性别基准行时合并显示（spec 21 §4.5） */}
                                <div className="text-xs text-neutral-600 font-mono">
                                  {(() => {
                                    const sexRanges = pickBestSexRanges(metricRanges);
                                    if (sexRanges.length === 0) {
                                      return formatRange(
                                        m.referenceRangeLow,
                                        m.referenceRangeHigh,
                                        m.unit,
                                      );
                                    }
                                    return (
                                      <span
                                        title={sexRanges
                                          .map(
                                            ([sex, r]) =>
                                              `${SEX_LABELS[sex] ?? sex} ${formatRange(r.rangeLow, r.rangeHigh, m.unit)}${r.source ? `（${r.source}）` : ""}`,
                                          )
                                          .join(" / ")}
                                      >
                                        {sexRanges
                                          .map(
                                            ([sex, r]) =>
                                              `${SEX_LABELS[sex] ?? sex} ${formatRange(r.rangeLow, r.rangeHigh, null)}`,
                                          )
                                          .join(" · ")}
                                      </span>
                                    );
                                  })()}
                                  {/* 来源徽标（spec 21 §15.5.2）：该指标最高等级区间的来源状态 */}
                                  <div className="mt-0.5">
                                    <RangeSourceBadge
                                      tier={badgeTier}
                                      citationKind={
                                        badgeCitationKind === "cited" || badgeCitationKind === "exempt"
                                          ? badgeCitationKind
                                          : null
                                      }
                                      citation={badgeCitation}
                                      source={bestRange?.source ?? null}
                                      verifiedAt={badgeVerifiedAt}
                                    />
                                  </div>
                                </div>

                                {/* 别名 */}
                                <div className="flex flex-wrap gap-1">
                                  {aliasList.map((a: string) => (
                                    <span
                                      key={a}
                                      className="inline-block rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500 font-mono"
                                    >
                                      {a}
                                    </span>
                                  ))}
                                  {moreAliases > 0 && (
                                    <span className="inline-block rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-400 font-mono">
                                      +{moreAliases}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Expanded detail: demographic ranges */}
                              {isMetricExpanded && (
                                <div className="border-b border-neutral-100 bg-neutral-50/50 px-5 py-4">
                                  <div className="mb-3 flex flex-wrap gap-1.5">
                                    {m.aliases.map((a: string) => (
                                      <span
                                        key={a}
                                        className="inline-block rounded-full border border-neutral-200 bg-white px-2.5 py-0.5 text-[11px] text-neutral-600 font-mono"
                                      >
                                        {a}
                                      </span>
                                    ))}
                                  </div>

                                  {m.loincCode && (
                                    <div className="mb-3 text-[11px] text-neutral-400 font-mono">
                                      LOINC: {m.loincCode}
                                    </div>
                                  )}

                                  {/* 口径说明（spec 19）：默认区间的来源/分期表/分层文本 */}
                                  {m.referenceRangeText && (
                                    <div className="mb-3 text-[11px] leading-relaxed text-neutral-500 font-mono">
                                      {m.referenceRangeText}
                                    </div>
                                  )}
                                  {isMethodDependent && (
                                    <div className="mb-3 text-[11px] text-amber-700 font-mono">
                                      检验方法依赖项：区间随仪器/试剂/厂商不同，以你的报告单为准。
                                    </div>
                                  )}
                                  {isCyclePhase && (
                                    <div className="mb-3 text-[11px] text-amber-700 font-mono">
                                      月经第 2-4 天（卵泡期）采血口径，其他阶段以报告单为准。
                                    </div>
                                  )}

                                  {metricRanges.length > 0 ? (
                                    <div>
                                      <div className="mb-2 text-[12px] font-medium text-neutral-700 font-body">
                                        参考区间
                                      </div>
                                      <div className="card">
                                        <div className="grid grid-cols-[1fr_1fr_1fr_1.2fr] gap-3 border-b border-neutral-200 bg-neutral-50 px-4 py-2">
                                          {[
                                            "性别",
                                            "年龄",
                                            "区间",
                                            "来源",
                                          ].map((h) => (
                                            <div
                                              key={h}
                                              className="text-[10px] font-semibold uppercase tracking-[0.04em] text-neutral-400 font-mono"
                                            >
                                              {h}
                                            </div>
                                          ))}
                                        </div>
                                        {metricRanges.map((r, idx) => {
                                          const isUserMatch =
                                            userSex &&
                                            (r.sex === null ||
                                              r.sex === userSex);
                                          // 分组头（spec 19 §3.4）：组切换时插一行来源组标题
                                          const group = sourceGroup(r.source, r.sourceTier);
                                          const prevGroup =
                                            idx > 0
                                              ? sourceGroup(metricRanges[idx - 1]!.source, metricRanges[idx - 1]!.sourceTier)
                                              : null;
                                          const showGroupHeader =
                                            prevGroup === null || prevGroup.order !== group.order;

                                          return (
                                            <div key={r.id}>
                                              {showGroupHeader && (
                                                <div className="border-b border-neutral-100 bg-neutral-50/60 px-4 py-1.5 text-[10px] font-medium text-neutral-400 font-mono">
                                                  {group.label}
                                                </div>
                                              )}
                                              <div
                                                className={`grid grid-cols-[1fr_1fr_1fr_1.2fr] items-center gap-3 border-b border-neutral-100 px-4 py-2.5 ${
                                                  isUserMatch
                                                    ? "bg-accent-50/40"
                                                    : ""
                                                }`}
                                              >
                                                <div className="flex items-center gap-1.5">
                                                  <span className="text-xs text-neutral-700 font-mono">
                                                    {r.sex
                                                      ? (SEX_LABELS[r.sex] ??
                                                        r.sex.charAt(0).toUpperCase() +
                                                          r.sex.slice(1))
                                                      : "不限"}
                                                  </span>
                                                  {isUserMatch && r.sex && (
                                                    <span className="inline-block size-1.5 rounded-full bg-accent-500" />
                                                  )}
                                                </div>
                                                <div className="text-xs text-neutral-600 font-mono">
                                                  {r.ageMin != null &&
                                                  r.ageMax != null
                                                    ? `${r.ageMin}~${r.ageMax}`
                                                    : r.ageMin != null
                                                      ? `${r.ageMin}+`
                                                      : r.ageMax != null
                                                        ? `≤ ${r.ageMax}`
                                                        : "不限"}
                                                </div>
                                                <div className="text-xs font-medium text-neutral-900 font-mono">
                                                  {formatRange(
                                                    r.rangeLow,
                                                    r.rangeHigh,
                                                    r.unit ?? m.unit,
                                                  )}
                                                </div>
                                                {/* 来源 + 徽标同格（spec 21 §15.5.2）：source 是「哪家医院/哪本教材」，
                                                    徽标是「核没核过/要不要处理」。两行必须包在同一个 grid 单元里，
                                                    否则第 5 个直接子元素会掉到下一行第 1 列、把整表挤歪。 */}
                                                <div className="min-w-0">
                                                  <div className="truncate text-[11px] text-neutral-400 font-mono">
                                                    {r.source ?? "—"}
                                                  </div>
                                                  <div className="mt-0.5">
                                                    <RangeSourceBadge
                                                      tier={r.sourceTier ?? null}
                                                      citationKind={
                                                        r.citationKind === 'cited' || r.citationKind === 'exempt'
                                                          ? r.citationKind
                                                          : null
                                                      }
                                                      citation={r.citation ?? null}
                                                      source={r.source ?? null}
                                                      verifiedAt={r.verifiedAt ?? null}
                                                    />
                                                  </div>
                                                  {claimMode && isClaimPending(r) && (
                                                    <button
                                                      type="button"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        modal.show(
                                                          <ClaimCitationModal
                                                            target="range"
                                                            id={r.id ?? ""}
                                                            name={`${m.name} 参考区间 ${formatRange(r.rangeLow, r.rangeHigh, r.unit ?? m.unit)}`}
                                                            metricCode={m.id}
                                                          />,
                                                        );
                                                      }}
                                                      className="mt-1 inline-flex cursor-pointer items-center gap-1 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 transition-colors hover:bg-amber-100"
                                                    >
                                                      <CheckCheck className="size-3" />
                                                      已核对
                                                    </button>
                                                  )}
                                                </div>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="text-[12px] text-neutral-400 font-body">
                                      无分性别人群参考区间——仅使用默认区间。
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
