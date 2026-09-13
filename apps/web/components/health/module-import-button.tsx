"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp } from "lucide-react";
import { toast } from "sonner";
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from "@openvitals/common";
import { trpc } from "@/lib/trpc/client";
import { getActiveProfileCookie } from "@/components/settings/member-switcher";

type ModuleImportButtonProps = {
  documentType?: "encounter_note" | "imaging_report" | "dental_record" | "immunization_record";
  importTarget?: "medication" | "condition" | "encounter";
  label: string;
  profileId?: string;
};

function uploadMimeType(file: File) {
  if (file.type) return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith(".md") || name.endsWith(".markdown")) return "text/markdown";
  if (name.endsWith(".txt")) return "text/plain";
  if (name.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "";
}

export function ModuleImportButton({ documentType, importTarget, label, profileId }: ModuleImportButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const createImport = trpc.importJobs.create.useMutation();

  async function upload(file: File) {
    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(uploadMimeType(file)) || file.size > MAX_FILE_SIZE) {
      toast.error("请选择不超过 50MB 的 PDF、图片、Word、Markdown、文本或支持的数据文件。");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/upload", { method: "POST", body: formData });
      if (!response.ok) throw new Error("文件上传失败");
      const { blobPath, contentHash, mimeType } = await response.json();
      const result = await createImport.mutateAsync({
        fileName: file.name, mimeType, blobPath, contentHash, fileSize: file.size,
        profileId: profileId ?? getActiveProfileCookie() ?? undefined, documentType, importTarget,
      });
      if (result.duplicate) {
        toast.info("该文件已导入，正在打开原有解析记录。");
        router.push(`/uploads/${result.existingJobId}`);
      } else {
        router.push(`/uploads/${result.importJobId}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导入失败");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return <>
    <input ref={inputRef} type="file" accept={ALLOWED_MIME_TYPES.join(",")} className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
    <button
      type="button"
      disabled={uploading}
      onClick={() => inputRef.current?.click()}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void upload(file); }}
      className="inline-flex h-9 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-700 shadow-xs transition-colors hover:border-accent-300 hover:text-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
      title="点击选择文件，或直接拖入图片、PDF、Markdown、文本或 Word 文档"
    >
      <FileUp className="size-4" />
      {uploading ? "解析准备中…" : label}
    </button>
  </>;
}
