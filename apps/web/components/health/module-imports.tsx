"use client";

import Link from "next/link";
import { FileClock, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc/client";

type ImportTarget = "medication" | "condition" | "encounter";

export function ModuleImports({ target }: { target: ImportTarget }) {
  const { data: imports } = trpc.importJobs.moduleRecent.useQuery({ target });
  if (!imports?.length) return null;

  return <section className="mt-8 border border-neutral-200 bg-white">
    <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-neutral-800"><FileClock className="size-4 text-accent-600" />最近导入</div>
      <Link href="/uploads" className="text-[11px] text-accent-600 hover:text-accent-700">查看全部</Link>
    </div>
    <div className="divide-y divide-neutral-100">
      {imports.map((item) => <Link key={item.id} href={`/uploads/${item.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-neutral-50">
        <div className="min-w-0"><p className="truncate text-[13px] font-medium text-neutral-800">{item.fileName}</p><p className="mt-0.5 text-[11px] text-neutral-500">{item.errorMessage ? "解析失败" : item.needsReview ? "待人工确认" : item.status === "completed" ? "已完成" : "正在解析"}{item.extractionCount != null ? ` · ${item.extractionCount} 条结果` : ""}</p></div>
        <ChevronRight className="size-4 shrink-0 text-neutral-400" />
      </Link>)}
    </div>
  </section>;
}
