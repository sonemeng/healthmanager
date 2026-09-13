"use client";

import { useState, useCallback, useEffect } from "react";
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from "@openvitals/common";
import { trpc } from "@/lib/trpc/client";
import { TitleActionHeader } from "@/components/title-action-header";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { StatusBadge } from "@/components/health/status-badge";
import { AnimatedEmptyState } from "@/components/animated-empty-state";
import { formatRelativeTime } from "@/lib/health-utils";
import { DOC_TYPE_LABELS, IMPORT_JOB_STATUS_MAP } from "@/lib/constants";
import {
  FileText,
  FileUp,
  FileScan,
  FileCheck,
  FileSearch,
  FileArchive,
  Trash2,
  RotateCw,
} from "lucide-react";
import { getActiveProfileCookie } from "@/components/settings/member-switcher";

const emptyIcons = [
  FileText,
  FileUp,
  FileScan,
  FileCheck,
  FileSearch,
  FileArchive,
];

type ImportJob = {
  id: string;
  status: string;
  classifiedType: string | null;
  classificationConfidence: number | null;
  extractionCount: number | null;
  needsReview: boolean | null;
  errorMessage: string | null;
  createdAt: Date | null;
  parseCompletedAt: Date | null;
  completedAt: Date | null;
  fileName: string;
  mimeType: string;
  fileSize: number | null;
};

function uploadMimeType(file: File) {
  if (file.type) return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith(".md") || name.endsWith(".markdown")) return "text/markdown";
  if (name.endsWith(".txt")) return "text/plain";
  if (name.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "";
}

const importColumns: DataTableColumn<ImportJob>[] = [
  {
    id: "file",
    header: "文件",
    width: "1.8fr",
    cell: (job) => (
      <div>
        <div className="text-sm font-medium text-neutral-900 font-body">
          {job.fileName}
        </div>
        <div className="mt-0.5 text-[11px] text-neutral-400 font-mono">
          {job.createdAt ? formatRelativeTime(job.createdAt) : "—"}
        </div>
      </div>
    ),
  },
  {
    id: "docType",
    header: "文档类型",
    width: "1fr",
    cell: (job) => (
      <span className="text-xs text-neutral-600 font-mono">
        {DOC_TYPE_LABELS[job.classifiedType ?? ""] ?? job.classifiedType ?? "—"}
      </span>
    ),
  },
  {
    id: "status",
    header: "状态",
    width: "0.8fr",
    cell: (job) => {
      const s =
        IMPORT_JOB_STATUS_MAP[job.status] ?? IMPORT_JOB_STATUS_MAP.completed!;
      return <StatusBadge status={s.badge} label={s.label} />;
    },
  },
  {
    id: "confidence",
    header: "置信度",
    width: "0.6fr",
    cell: (job) => (
      <span className="text-xs text-neutral-500 font-mono">
        {job.classificationConfidence != null
          ? job.classificationConfidence.toFixed(2)
          : "—"}
      </span>
    ),
  },
  {
    id: "extracted",
    header: "提取结果",
    width: "0.8fr",
    align: "right",
    cell: (job) => (
      <span className="text-[13px] font-semibold text-accent-600 font-mono">
        {job.extractionCount != null
          ? `${job.extractionCount} 条记录`
          : "— 条记录"}
      </span>
    ),
  },
];

export default function UploadsPage() {
  const [dragActive, setDragActive] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [duplicateJob, setDuplicateJob] = useState<{
    jobId: string;
    status: string;
    fileName: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmUpload, setConfirmUpload] = useState(false);

  // Each import begins with the profile currently being viewed. The selection
  // below applies only to this upload and never changes the global profile.
  const profilesQuery = trpc.profiles.list.useQuery();
  const activeProfileQuery = trpc.profiles.active.useQuery();
  const profiles = profilesQuery.data ?? [];
  const [activeProfileId, setActiveProfileId] = useState<string | undefined>(
    undefined,
  );

  useEffect(() => {
    setActiveProfileId(getActiveProfileCookie() ?? activeProfileQuery.data?.id);
  }, [activeProfileQuery.data?.id]);

  // 选中项不在列表里时回落到 isDefault 或第一个
  useEffect(() => {
    if (profiles.length === 0) return;
    if (activeProfileId && profiles.some((p) => p.id === activeProfileId)) return;
    const fallback =
      profiles.find((p) => p.isDefault)?.id ?? profiles[0]?.id ?? undefined;
    if (fallback) {
      setActiveProfileId(fallback);
    }
  }, [profiles, activeProfileId]);

  const selectProfile = (id: string) => {
    setActiveProfileId(id);
  };

  const { data: jobsData, isLoading: jobsLoading } =
    trpc.importJobs.list.useQuery(
      { limit: 20 },
      {
        refetchInterval: (query) => {
          const items = query.state.data?.items;
          if (!items) return false;
          const activeStatuses = new Set([
            "pending",
            "classifying",
            "parsing",
            "normalizing",
          ]);
          return items.some((job) => activeStatuses.has(job.status))
            ? 3000
            : false;
        },
      },
    );
  const createImport = trpc.importJobs.create.useMutation();
  const deleteImport = trpc.importJobs.delete.useMutation({
    onSuccess: () => utils.importJobs.list.invalidate(),
  });
  const reprocessOne = trpc.importJobs.reprocess.useMutation({
    onSuccess: () => {
      setDuplicateJob(null);
      utils.importJobs.list.invalidate();
    },
  });
  const reprocessAll = trpc.importJobs.reprocessAll.useMutation({
    onSuccess: () => utils.importJobs.list.invalidate(),
  });
  const [confirmReprocess, setConfirmReprocess] = useState(false);
  const utils = trpc.useUtils();

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  }, []);

  const validateFile = useCallback((file: File): string | null => {
    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(uploadMimeType(file)))
      return `不支持的文件类型：${file.name}`;
    if (file.size > MAX_FILE_SIZE)
      return `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB (max 50MB)`;
    return null;
  }, []);

  const handleFiles = useCallback(
    (newFiles: FileList | null) => {
      if (!newFiles) return;
      setError("");
      for (const file of Array.from(newFiles)) {
        const err = validateFile(file);
        if (err) {
          setError(err);
          return;
        }
      }
      setFiles((prev) => [...prev, ...Array.from(newFiles)]);
    },
    [validateFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  const handleUpload = useCallback(async () => {
    if (files.length === 0) return;
    setUploading(true);
    setError("");
    setDuplicateJob(null);
    try {
      for (const file of files) {
        // Upload to blob storage first
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) throw new Error(`Upload failed for ${file.name}`);
        const { blobPath, contentHash, mimeType } = await res.json();

        // Create import job
        const result = await createImport.mutateAsync({
          fileName: file.name,
          mimeType,
          blobPath,
          contentHash,
          fileSize: file.size,
          profileId: activeProfileId || undefined,
        });

        if (result.duplicate) {
          setDuplicateJob({
            jobId: result.existingJobId,
            status: result.existingStatus,
            fileName: result.existingFileName,
          });
          return;
        }
      }
      setFiles([]);
      utils.importJobs.list.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [files, createImport, utils, activeProfileId]);

  const selectedProfile = profiles.find((profile) => profile.id === activeProfileId);
  const requestUploadConfirmation = () => {
    if (!selectedProfile) {
      setError("请先选择报告所属的健康档案");
      return;
    }
    setConfirmUpload(true);
  };

  const recentJobs = jobsData?.items ?? [];

  return (
    <div>
      <TitleActionHeader
        title="报告上传"
        subtitle="上传体检报告、健康记录或数据导出，自动解析并分析。"
      />

      {error && (
        <div className="mt-7 mb-4 rounded-lg bg-[var(--color-health-critical-bg)] border border-[var(--color-health-critical-border)] p-3 text-sm text-[var(--color-health-critical)]">
          {error}
        </div>
      )}

      {duplicateJob && (
        <div className="mt-7 mb-4 rounded-lg bg-amber-50 border border-amber-200 p-4">
          <p className="text-sm font-medium text-amber-900">
            &ldquo;{duplicateJob.fileName}&rdquo; 已经上传过
          </p>
          <p className="mt-1 text-sm text-amber-700">
            这份文件之前已导入，当前状态为
            <span className="font-medium">
              {IMPORT_JOB_STATUS_MAP[duplicateJob.status]?.label ?? duplicateJob.status}
            </span>
            。如果上次导入卡住或失败，可以重新解析。
          </p>
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={() => {
                reprocessOne.mutate({ id: duplicateJob.jobId });
                setFiles([]);
              }}
              disabled={reprocessOne.isPending}
              className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50"
            >
              <RotateCw className="h-3.5 w-3.5" />
              {reprocessOne.isPending
                ? "重新解析中…"
                : "重新解析该文件"}
            </button>
            <button
              onClick={() => {
                setDuplicateJob(null);
                setFiles([]);
              }}
              className="text-sm text-amber-600 hover:text-amber-800"
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {/* 成员归属选择 */}
      {profiles.length > 0 && (
        <div className="mt-7 flex items-center gap-2 text-sm text-neutral-600">
          <span>这份报告属于：</span>
          <select
            value={activeProfileId ?? ""}
            onChange={(e) => selectProfile(e.target.value)}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-[13px] text-neutral-900 focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100 cursor-pointer"
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <span className="text-[12px] text-neutral-400">
            上传后将归入该成员的健康档案
          </span>
        </div>
      )}

      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`mt-4 rounded-xl border-2 border-dashed bg-white p-12 text-center transition-colors ${dragActive ? "border-accent-500 bg-accent-50" : "border-neutral-300 hover:border-neutral-400"}`}
      >
        <p className="text-sm font-medium text-neutral-900 font-body">
          拖拽文件到此处
        </p>
        <p className="mt-1 text-sm text-neutral-500">或</p>
        <label className="mt-2 inline-block cursor-pointer rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
          点击选择文件
          <input
            type="file"
            multiple
            accept={ALLOWED_MIME_TYPES.join(",")}
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
          />
        </label>
        <p className="mt-2 text-[11px] text-neutral-400 font-mono">
          PDF、Word（.docx）、Markdown、文本、CSV、JPEG、PNG、JSON — 最大 50MB
        </p>
      </div>

      {files.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-medium text-neutral-900 mb-2">
            待上传文件
          </h2>
          <ul className="card divide-y divide-neutral-200">
            {files.map((file, i) => (
              <li
                key={i}
                className="flex items-center justify-between px-5 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-neutral-900">
                    {file.name}
                  </p>
                  <p className="text-[11px] text-neutral-400 font-mono">
                    {file.type} — {(file.size / 1024).toFixed(0)} KB
                  </p>
                </div>
                <button
                  onClick={() =>
                    setFiles((p) => p.filter((_, idx) => idx !== i))
                  }
                  className="text-sm text-neutral-500 hover:text-red-600"
                >
                  移除
                </button>
              </li>
            ))}
          </ul>
          <button
            onClick={requestUploadConfirmation}
            disabled={uploading}
            className="mt-4 rounded-lg bg-accent-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-accent-700 transition-colors disabled:opacity-50"
          >
            {uploading
              ? "上传中…"
              : `继续：确认归属后上传 ${files.length} 个文件`}
          </button>
        </div>
      )}

      {confirmUpload && selectedProfile && (
        <div className="mt-4 rounded-xl border border-accent-200 bg-accent-50 p-4">
          <p className="text-sm font-semibold text-neutral-900">确认报告归属</p>
          <p className="mt-1 text-sm text-neutral-600">
            本次 {files.length} 个文件将导入至：<span className="font-semibold text-accent-700">{selectedProfile.name}</span>
            {selectedProfile.isDefault ? "（本人档案）" : "（家庭成员）"}。
          </p>
          <p className="mt-1 text-[12px] text-neutral-500">导入后，检验结果、报告和后续分析都会归入该档案。</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setConfirmUpload(false)} className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-600 hover:bg-neutral-50">返回修改</button>
            <button type="button" onClick={() => { setConfirmUpload(false); void handleUpload(); }} className="rounded-lg bg-accent-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent-700">确认并上传</button>
          </div>
        </div>
      )}

      {/* Recent imports */}
      <div className="mt-10">
        <h2 className="mb-4 text-lg font-medium tracking-[-0.015em] text-neutral-900 font-display">
          最近导入
        </h2>
        {recentJobs.length === 0 && !jobsLoading ? (
          <AnimatedEmptyState
            title="暂无上传记录"
            description="在上方上传一份报告开始解析。"
            cardIcon={({ index }) => emptyIcons[index % emptyIcons.length]!}
          />
        ) : (
          <DataTable<ImportJob>
            data={recentJobs}
            loading={jobsLoading}
            columns={importColumns}
            rowConfig={{
              getRowKey: (job) => job.id,
              getRowHref: (job) => `/uploads/${job.id}`,
              renderActions: (job) => (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    deleteImport.mutate({ id: job.id });
                  }}
                  className="p-1 rounded text-neutral-400 hover:text-red-500 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ),
            }}
            hasActionColumn
            actionColumnWidth="2rem"
          />
        )}
      </div>

      {/* Reprocess all — subtle footer action */}
      {recentJobs.length > 0 && (
        <div className="mt-8 flex items-center justify-end gap-3">
          {confirmReprocess ? (
            <>
              <span className="text-xs text-neutral-500">
                将用最新解析逻辑重新处理所有报告，现有结果会被替换。
              </span>
              <button
                onClick={() => setConfirmReprocess(false)}
                className="rounded px-3 py-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-700"
              >
                取消
              </button>
              <button
                onClick={() => {
                  reprocessAll.mutate();
                  setConfirmReprocess(false);
                }}
                disabled={reprocessAll.isPending}
                className="rounded px-3 py-1.5 text-xs font-medium text-neutral-600 border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50"
              >
                {reprocessAll.isPending
                  ? "重新解析中…"
                  : "确认重新解析"}
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmReprocess(true)}
              className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              <RotateCw className="h-3 w-3" />
              重新解析全部报告
            </button>
          )}
        </div>
      )}
    </div>
  );
}
