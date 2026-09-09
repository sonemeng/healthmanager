import { generateText } from 'ai';
import { getDb } from '@openvitals/database/client';
import { sourceArtifacts, users, aiChannels } from '@openvitals/database';
import { and, eq } from 'drizzle-orm';
import { createBlobStorage } from '@openvitals/blob-storage';
import { extractLabsImageZhPrompt, resolveModel } from '@openvitals/ai';
import type { WorkflowContext } from '../workflow';
import type { ParseResult, RawExtraction } from '@openvitals/ingestion';

export async function parseLabImage(ctx: WorkflowContext): Promise<ParseResult> {
  const db = getDb();

  // Get artifact
  const [artifact] = await db.select()
    .from(sourceArtifacts)
    .where(eq(sourceArtifacts.id, ctx.artifactId))
    .limit(1);

  if (!artifact) throw new Error(`Artifact ${ctx.artifactId} not found`);

  // Download blob → Buffer → Uint8Array
  const storage = createBlobStorage();
  const blob = await storage.download(artifact.blobPath);
  const chunks: Uint8Array[] = [];
  const reader = blob.data.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const buffer = Buffer.concat(chunks);

  // 用户级 AI 渠道（启用中优先），否则环境变量 / Gateway 兜底
  const modelId = process.env.AI_DEFAULT_MODEL ?? 'claude-sonnet-4-20250514';
  const [userRow] = await db.select({ aiModel: users.aiModel })
    .from(users).where(eq(users.id, ctx.userId)).limit(1);
  const [channel] = await db.select({
    baseUrl: aiChannels.baseUrl,
    apiKey: aiChannels.apiKey,
    protocol: aiChannels.protocol,
  }).from(aiChannels)
    .where(and(eq(aiChannels.userId, ctx.userId), eq(aiChannels.isActive, true)))
    .limit(1);

  // 视觉解析：必须用 messages 而非 prompt；字段名是 mediaType 不是 mimeType
  const { text } = await generateText({
    model: resolveModel(userRow?.aiModel ?? modelId, channel
      ? { baseUrl: channel.baseUrl, apiKey: channel.apiKey, protocol: channel.protocol }
      : undefined),
    system: extractLabsImageZhPrompt,
    messages: [{
      role: 'user' as const,
      content: [
        {
          type: 'image' as const,
          image: new Uint8Array(buffer),
          mediaType: artifact.mimeType,
        },
        {
          type: 'text' as const,
          text: `文件名：${artifact.fileName}\n请解析这张检验报告照片，按系统指令输出 JSON。`,
        },
      ],
    }],
  });

  // 留存原始输出（排查提取质量的唯一手段）
  console.log(`[lab-image] raw output (first 600 chars):\n${text.slice(0, 600)}`);
  await db
    .update(sourceArtifacts)
    .set({ rawTextExtracted: text.slice(0, 50000) })
    .where(eq(sourceArtifacts.id, ctx.artifactId));

  let parsed: any;
  try {
    const jsonStr = text.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
    parsed = JSON.parse(jsonStr);
  } catch {
    console.error('[lab-image] Failed to parse AI response:', text.slice(0, 300));
    return {
      extractions: [],
      rawMetadata: {
        parser: 'lab-image',
        version: '0.1.0',
        error: 'parse_failed',
        reviewReason: 'AI 返回内容无法解析为 JSON，请人工录入或重新上传更清晰的照片',
      },
    };
  }

  const fallbackDate = parsed.collectionDate ?? parsed.reportDate ?? null;
  const rows = (parsed.results ?? []) as any[];
  const missingDateCount = rows.filter((r) => !r.observedAt && !fallbackDate).length;

  const extractions: RawExtraction[] = rows
    .filter((r) => (r.observedAt || fallbackDate) && r.analyte && String(r.analyte).trim().length > 0)
    .map((r) => ({
      analyte: String(r.analyte).trim(),
      value: typeof r.value === 'number' ? r.value : null,
      valueText: r.valueText ?? (r.value != null ? String(r.value) : null),
      unit: r.unit ?? null,
      referenceRangeLow: typeof r.referenceRangeLow === 'number' ? r.referenceRangeLow : null,
      referenceRangeHigh: typeof r.referenceRangeHigh === 'number' ? r.referenceRangeHigh : null,
      referenceRangeText: r.referenceRangeText ?? null,
      isAbnormal: typeof r.isAbnormal === 'boolean' ? r.isAbnormal : null,
      observedAt: r.observedAt ?? fallbackDate,
      category: 'lab_result' as const,
    }));

  return {
    extractions,
    patientName: parsed.patientName,
    collectionDate: parsed.collectionDate,
    reportDate: parsed.reportDate,
    rawMetadata: {
      parser: 'lab-image',
      version: '0.1.0',
      labName: parsed.labName ?? null,
      reportTitle: parsed.reportTitle ?? null,
      ...(missingDateCount > 0 && {
        needsReview: true,
        reviewReason: `${missingDateCount} 提取结果缺少采样日期。`,
      }),
    },
  };
}
