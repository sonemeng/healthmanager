'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CategoryStat {
  category: string;
  total: number;
  normal: number;
  warning: number;
  critical: number;
}

interface CategoryOverviewProps {
  categories: CategoryStat[];
}

const CATEGORY_LABELS: Record<string, string> = {
  blood_chemistry: '血液生化',
  hematology: '血常规',
  endocrine: '内分泌',
  vitamins_minerals: '维生素与矿物质',
  inflammation: '炎症',
  liver: '肝脏',
  kidney: '肾脏',
  cardiac: '心脏',
  iron_studies: '铁代谢',
  urinalysis: '尿液分析',
  thyroid: '甲状腺',
  metabolic: '代谢',
  lipid: '血脂',
  cbc: '血常规',
};

function getCategoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] ?? cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function CategoryOverview({ categories }: CategoryOverviewProps) {
  if (categories.length === 0) return null;

  return (
    <div className="card">
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
        <h2 className="text-[13px] font-semibold text-neutral-900 font-display">
          分类概览
        </h2>
        <Link
          href="/biomarkers"
          className="text-[11px] font-mono text-neutral-400 hover:text-neutral-600 transition-colors flex items-center gap-1"
        >
          详情
          <ChevronRight className="size-3" />        </Link>
      </div>
      <div className="divide-y divide-neutral-100">
        {categories.map((cat) => {
          const normalPct = cat.total > 0 ? (cat.normal / cat.total) * 100 : 0;
          const warningPct = cat.total > 0 ? (cat.warning / cat.total) * 100 : 0;
          const criticalPct = cat.total > 0 ? (cat.critical / cat.total) * 100 : 0;
          const allNormal = cat.warning === 0 && cat.critical === 0;

          return (
            <div key={cat.category} className="px-4 py-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[12px] font-medium text-neutral-700 font-body">
                  {getCategoryLabel(cat.category)}
                </span>
                <div className="flex items-center gap-2">
                  {!allNormal && (
                    <span className="text-[10px] font-mono text-health-warning font-bold">
                      {cat.warning + cat.critical} flagged
                    </span>
                  )}
                  <span className="text-[10px] font-mono text-neutral-400 tabular-nums">
                    {cat.total}
                  </span>
                </div>
              </div>
              {/* Status bar */}
              <div className="h-1.5 w-full bg-neutral-100 flex overflow-hidden">
                {criticalPct > 0 && (
                  <div
                    className="bg-health-critical h-full"
                    style={{ width: `${criticalPct}%` }}
                  />
                )}
                {warningPct > 0 && (
                  <div
                    className="bg-health-warning h-full"
                    style={{ width: `${warningPct}%` }}
                  />
                )}
                <div
                  className="bg-health-normal h-full"
                  style={{ width: `${normalPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
