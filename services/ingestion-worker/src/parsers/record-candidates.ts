import { generateText } from 'ai';
import { createBlobStorage } from '@openvitals/blob-storage';
import { getDb } from '@openvitals/database/client';
import { aiChannels, importJobs, sourceArtifacts, users } from '@openvitals/database';
import { and, eq } from 'drizzle-orm';
import { extractRecordCandidatesPrompt, resolveModel } from '@openvitals/ai';
import type { ParseResult, PendingRecordCandidate } from '@openvitals/ingestion';
import type { WorkflowContext } from '../workflow';

const encounterTypes = new Set(['checkup', 'specialist', 'urgent_care', 'emergency', 'telehealth', 'lab_visit', 'imaging', 'dental', 'therapy', 'other']);
type ExtractedRecord = Record<string, unknown>;

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export async function parseRecordCandidates(ctx: WorkflowContext): Promise<ParseResult> {
  const db = getDb();
  const [artifact] = await db.select().from(sourceArtifacts).where(eq(sourceArtifacts.id, ctx.artifactId)).limit(1);
  if (!artifact) throw new Error(`Artifact ${ctx.artifactId} not found`);
  const [job] = await db.select({ errorDetailJson: importJobs.errorDetailJson })
    .from(importJobs).where(eq(importJobs.id, ctx.importJobId)).limit(1);
  const target = typeof (job?.errorDetailJson as Record<string, unknown> | null)?.importTarget === 'string'
    ? (job!.errorDetailJson as Record<string, unknown>).importTarget
    : undefined;
  let text = artifact.rawTextExtracted ?? '';
  let image: Uint8Array | undefined;
  if (artifact.mimeType.startsWith('image/')) {
    const blob = await createBlobStorage().download(artifact.blobPath);
    const chunks: Uint8Array[] = [];
    const reader = blob.data.getReader();
    while (true) { const { done, value } = await reader.read(); if (done) break; if (value) chunks.push(value); }
    image = new Uint8Array(Buffer.concat(chunks));
  }
  if (!text.trim() && !image) return { extractions: [], rawMetadata: { needsReview: true, reviewReason: '文档没有可提取的文本，无法生成待确认记录。' } };

  const [user, channel] = await Promise.all([
    db.select({ aiModel: users.aiModel }).from(users).where(eq(users.id, ctx.userId)).limit(1),
    db.select({ baseUrl: aiChannels.baseUrl, apiKey: aiChannels.apiKey, protocol: aiChannels.protocol }).from(aiChannels).where(and(eq(aiChannels.userId, ctx.userId), eq(aiChannels.isActive, true))).limit(1),
  ]);
  const model = resolveModel(
    user[0]?.aiModel ?? process.env.AI_DEFAULT_MODEL ?? 'claude-sonnet-4-20250514',
    channel[0] ? { baseUrl: channel[0].baseUrl, apiKey: channel[0].apiKey, protocol: channel[0].protocol } : undefined,
  );
  const responseResult = image
    ? await generateText({
        model,
        system: extractRecordCandidatesPrompt,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', image, mediaType: artifact.mimeType },
            { type: 'text', text: `文件名：${artifact.fileName}\n请从图片提取待确认的用药、病史和就诊记录。` },
          ],
        }],
      })
    : await generateText({ model, system: extractRecordCandidatesPrompt, prompt: text.slice(0, 30000) });
  const response = responseResult.text;
  try {
    const parsed = JSON.parse(response.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim());
    const medicationRows = (Array.isArray(parsed.medications) ? parsed.medications : []) as ExtractedRecord[];
    const conditionRows = (Array.isArray(parsed.conditions) ? parsed.conditions : []) as ExtractedRecord[];
    const encounterRows = (Array.isArray(parsed.encounters) ? parsed.encounters : []) as ExtractedRecord[];
    const candidates: PendingRecordCandidate[] = [
      ...(target === undefined || target === 'medication' ? medicationRows.flatMap((row, index) => {
        const name = optionalString(row.name);
        return name ? [{ id: `medication-${index}`, kind: 'medication' as const, status: 'pending' as const, name, dosage: optionalString(row.dosage), frequency: optionalString(row.frequency), indication: optionalString(row.indication), startDate: optionalString(row.startDate) }] : [];
      }) : []),
      ...(target === undefined || target === 'condition' ? conditionRows.flatMap((row, index) => {
        const name = optionalString(row.name);
        const severity = optionalString(row.severity);
        const validSeverity: Extract<PendingRecordCandidate, { kind: 'condition' }>['severity'] =
          severity === 'mild' || severity === 'moderate' || severity === 'severe' ? severity : undefined;
        return name ? [{ id: `condition-${index}`, kind: 'condition' as const, status: 'pending' as const, name, severity: validSeverity, onsetDate: optionalString(row.onsetDate), notes: optionalString(row.notes) }] : [];
      }) : []),
      ...(target === undefined || target === 'encounter' ? encounterRows.flatMap((row, index) => {
        const encounterDate = optionalString(row.encounterDate);
        const type = optionalString(row.type);
        return encounterDate ? [{ id: `encounter-${index}`, kind: 'encounter' as const, status: 'pending' as const, type: type && encounterTypes.has(type) ? type as Extract<PendingRecordCandidate, { kind: 'encounter' }>['type'] : 'other', encounterDate, provider: optionalString(row.provider), facility: optionalString(row.facility), chiefComplaint: optionalString(row.chiefComplaint), summary: optionalString(row.summary) }] : [];
      }) : []),
    ];
    return { extractions: [], rawMetadata: {
      needsReview: true,
      reviewReason: candidates.length
        ? '发现待确认的健康记录。'
        : target
          ? '未发现可写入当前模块的记录。请改从对应模块导入，或使用通用报告上传。'
          : '未发现可确认的结构化健康记录。',
      candidates,
    } };
  } catch {
    return { extractions: [], rawMetadata: { needsReview: true, reviewReason: '候选记录解析失败，请人工查看原始文档。' } };
  }
}
