import { generateText } from 'ai';
import { getDb } from '@openvitals/database/client';
import { sourceArtifacts, users, aiChannels } from '@openvitals/database';
import { and, eq } from 'drizzle-orm';
import { createBlobStorage } from '@openvitals/blob-storage';
import { extractLabsPrompt, resolveModel } from '@openvitals/ai';
import type { WorkflowContext } from '../workflow';
import type { ParseResult, RawExtraction } from '@openvitals/ingestion';

export async function parseLabPdf(ctx: WorkflowContext): Promise<ParseResult> {
  const db = getDb();

  // Get artifact with extracted text
  const [artifact] = await db.select()
    .from(sourceArtifacts)
    .where(eq(sourceArtifacts.id, ctx.artifactId))
    .limit(1);

  if (!artifact) throw new Error(`Artifact ${ctx.artifactId} not found`);

  let textContent = artifact.rawTextExtracted ?? '';

  // If no extracted text yet, download and extract
  if (!textContent) {
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

    if (artifact.mimeType === 'application/pdf') {
      const { extractTextFromPdf } = await import('../lib/pdf');
      textContent = await extractTextFromPdf(buffer);
    } else if (artifact.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const mammoth = await import('mammoth');
      textContent = (await mammoth.extractRawText({ buffer })).value;
    } else {
      textContent = buffer.toString('utf-8');
    }
  }

  console.log(`[lab-pdf] Extracted ${textContent.length} chars from artifact=${ctx.artifactId}`);

  // Send to AI for structured extraction
  const modelId = process.env.AI_DEFAULT_MODEL ?? 'anthropic/claude-sonnet-4-20250514';

  // 用户级 AI 渠道（启用中优先），否则环境变量 / Gateway 兜底
  const [userRow] = await db.select({ aiModel: users.aiModel })
    .from(users).where(eq(users.id, ctx.userId)).limit(1);
  const [channel] = await db.select({
    baseUrl: aiChannels.baseUrl,
    apiKey: aiChannels.apiKey,
    protocol: aiChannels.protocol,
  }).from(aiChannels)
    .where(and(eq(aiChannels.userId, ctx.userId), eq(aiChannels.isActive, true)))
    .limit(1);

  const { text } = await generateText({
    model: resolveModel(userRow?.aiModel ?? modelId, channel
      ? { baseUrl: channel.baseUrl, apiKey: channel.apiKey, protocol: channel.protocol }
      : undefined),
    system: extractLabsPrompt,
    prompt: textContent.slice(0, 30000),
  });

  let parsed: any;
  try {
    const jsonStr = text.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
    parsed = JSON.parse(jsonStr);
  } catch {
    console.error('[lab-pdf] Failed to parse AI response:', text.slice(0, 300));
    return { extractions: [], rawMetadata: { parser: 'lab-pdf', version: '0.1.0', error: 'parse_failed' } };
  }

  const fallbackDate = parsed.collectionDate ?? parsed.reportDate ?? null;
  const rows = (parsed.results ?? []) as any[];
  const missingDateCount = rows.filter((r) => !r.observedAt && !fallbackDate).length;

  const extractions: RawExtraction[] = rows
    .filter((r) => r.observedAt || fallbackDate)
    .map((r) => ({
      analyte: r.analyte ?? '',
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
    labName: parsed.labName,
    rawMetadata: {
      parser: 'lab-pdf',
      version: '0.1.0',
      ...(missingDateCount > 0 && {
        needsReview: true,
        reviewReason: `${missingDateCount} extracted lab result(s) were missing an observation date.`,
      }),
    },
  };
}
