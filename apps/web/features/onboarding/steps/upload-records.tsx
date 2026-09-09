'use client';

import { useState, useCallback } from 'react';
import { Upload, FileText, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc/client';
import { toast } from 'sonner';
import { StepLayout } from '../components/step-layout';
import { StepButtons } from '../components/step-buttons';

interface UploadRecordsData {
  files: File[];
}

interface UploadRecordsStepProps {
  data: UploadRecordsData;
  onChange: (data: UploadRecordsData) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  direction: 1 | -1;
}

const categories = [
  { label: '化验报告', desc: '血常规、尿常规、生化全套', icon: '◎' },
  { label: '医疗记录', desc: '门诊记录、出院小结', icon: '⊟' },
  { label: '影像报告', desc: 'X 光、核磁、CT 结果', icon: '⊡' },
  { label: '医保卡/就诊卡', desc: '正反面照片', icon: '⊞' },
];

export function UploadRecordsStep({ data, onChange, onNext, onBack, onSkip, direction }: UploadRecordsStepProps) {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const createImport = trpc.importJobs.create.useMutation();

  const addFiles = useCallback((newFiles: FileList | null) => {
    if (!newFiles) return;
    onChange({ files: [...data.files, ...Array.from(newFiles)] });
  }, [data.files, onChange]);

  const removeFile = (index: number) => {
    onChange({ files: data.files.filter((_, i) => i !== index) });
  };

  const handleContinue = useCallback(async () => {
    if (data.files.length === 0) {
      onNext();
      return;
    }

    setUploading(true);
    try {
      for (const file of data.files) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        if (!res.ok) throw new Error(`Upload failed for ${file.name}`);
        const { blobPath, contentHash } = await res.json();

        await createImport.mutateAsync({
          fileName: file.name,
          mimeType: file.type,
          blobPath,
          contentHash,
          fileSize: file.size,
        });
      }
      toast.success(`${data.files.length} file${data.files.length > 1 ? 's' : ''} uploaded`);
      onNext();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploading(false);
    }
  }, [data.files, createImport, onNext]);

  return (
    <StepLayout
      stepKey="upload-records"
      direction={direction}
      title="上传你的报告"
      subtitle="有检验报告或医疗记录？立即上传，我们会解析成结构化数据。"
      why="为什么？上传报告让你从第一天起就有完整的健康档案。"
      wide
      footer={
        <StepButtons
          onNext={handleContinue}
          onBack={onBack}
          onSkip={onSkip}
          showSkip
          nextLabel={uploading ? '上传中…' : data.files.length > 0 ? `Upload ${data.files.length} file${data.files.length > 1 ? 's' : ''}` : 'Continue'}
          nextDisabled={uploading}
        />
      }
    >
      <div className="space-y-5">
        {/* What to upload */}
        <div className="grid grid-cols-2 gap-2">
          {categories.map((cat) => (
            <div key={cat.label} className="border border-neutral-200 bg-white px-3.5 py-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[13px] text-accent-500 font-mono">{cat.icon}</span>
                <span className="text-[13px] font-medium text-neutral-800 font-body">{cat.label}</span>
              </div>
              <p className="text-[11px] text-neutral-400 font-body">{cat.desc}</p>
            </div>
          ))}
        </div>

        {/* Drop zone */}
        <div
          onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); setDragActive(false); addFiles(e.dataTransfer.files); }}
          className={cn(
            'border-2 border-dashed p-8 text-center transition-colors',
            dragActive
              ? 'border-accent-500 bg-accent-50'
              : 'border-neutral-300 bg-white hover:border-neutral-400'
          )}
        >
          {uploading ? (
            <Loader2 className="mx-auto mb-3 size-5 text-accent-500 animate-spin" />
          ) : (
            <Upload className="mx-auto mb-3 size-5 text-neutral-400" />
          )}
          <p className="text-[13px] font-medium text-neutral-700 font-body">
            Drop files here or{' '}
            <label className="text-accent-600 hover:text-accent-700 cursor-pointer">
              browse
              <input type="file" multiple accept=".pdf,.csv,.jpg,.jpeg,.png,.json" onChange={(e) => addFiles(e.target.files)} className="hidden" />
            </label>
          </p>
          <p className="mt-1 text-[11px] text-neutral-400 font-mono">
            PDF, CSV, JPEG, PNG, JSON — up to 50MB each
          </p>
        </div>

        {/* File list */}
        {data.files.length > 0 && (
          <div className="space-y-1.5">
            {data.files.map((file, i) => (
              <div key={i} className="flex items-center justify-between border border-neutral-200 bg-white px-3.5 py-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileText className="size-4 shrink-0 text-neutral-400" />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-neutral-800 font-body">{file.name}</p>
                    <p className="text-[10px] text-neutral-400 font-mono">
                      {file.type || 'unknown'} — {(file.size / 1024).toFixed(0)} KB
                    </p>
                  </div>
                </div>
                <button type="button" onClick={() => removeFile(i)} disabled={uploading} className="shrink-0 text-neutral-400 hover:text-neutral-600 cursor-pointer disabled:opacity-50">
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </StepLayout>
  );
}

export type { UploadRecordsData };
