import { generateText } from "ai";
import { getDb } from "@openvitals/database/client";
import { importJobs, sourceArtifacts, users, aiChannels } from "@openvitals/database";
import { and, eq } from "drizzle-orm";
import { classifyDocumentPrompt, classifyImagePrompt, resolveModel } from "@openvitals/ai";
import { createBlobStorage } from "@openvitals/blob-storage";
import type { WorkflowContext } from "../workflow";
import type { ClassificationResult } from "@openvitals/ingestion";

export async function classify(
  ctx: WorkflowContext,
): Promise<ClassificationResult> {
  const db = getDb();

  // Update status to classifying
  await db
    .update(importJobs)
    .set({ status: "classifying", startedAt: new Date() })
    .where(eq(importJobs.id, ctx.importJobId));

  // Fetch artifact metadata
  const [artifact] = await db
    .select()
    .from(sourceArtifacts)
    .where(eq(sourceArtifacts.id, ctx.artifactId))
    .limit(1);

  if (!artifact) throw new Error(`Artifact ${ctx.artifactId} not found`);

  const [job] = await db.select({ classifiedType: importJobs.classifiedType, classificationConfidence: importJobs.classificationConfidence })
    .from(importJobs).where(eq(importJobs.id, ctx.importJobId)).limit(1);
  const forcedDocumentType = job?.classificationConfidence === 1
    ? job.classifiedType as ClassificationResult["documentType"] | null
    : null;

  // 图片分类需要视觉输入。有强制类型（用户上传时指定）时直接采用；
  // 自动模式下让视觉模型看图判断：化验单照片走检验解析，其他照片走候选记录流。
  // 视觉分类失败时保持兜底行为（unknown → 可复核的候选提取）。
  if (artifact.mimeType.startsWith("image/")) {
    let result: ClassificationResult;

    if (forcedDocumentType) {
      result = {
        documentType: forcedDocumentType,
        confidence: 1,
        reasoning: "Module-specific import type",
      };
    } else {
      result = {
        documentType: "unknown",
        confidence: 0.8,
        reasoning: "Image classification failed, routed to reviewable health-record extraction",
      };
      try {
        // 下载图片供视觉模型使用
        const storage = createBlobStorage();
        const blob = await storage.download(artifact.blobPath);
        const chunks: Uint8Array[] = [];
        const reader = blob.data.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) chunks.push(value);
        }
        const imageBuffer = Buffer.concat(chunks);

        // 用户级 AI 渠道（启用中优先），否则环境变量 / Gateway 兜底
        const modelId = process.env.AI_DEFAULT_MODEL ?? "anthropic/claude-sonnet-4-20250514";
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
          system: classifyImagePrompt,
          messages: [{
            role: "user" as const,
            content: [
              {
                type: "image" as const,
                image: new Uint8Array(imageBuffer),
                mediaType: artifact.mimeType,
              },
              {
                type: "text" as const,
                text: `文件名：${artifact.fileName}\n请判断这张照片的类型，按系统指令输出 JSON。`,
              },
            ],
          }],
        });

        const jsonStr = text
          .replace(/^```(?:json)?\s*\n?/m, "")
          .replace(/\n?```\s*$/m, "")
          .trim();
        const parsed = JSON.parse(jsonStr);
        // 只有明确识别的类型才采纳，other/无法解析时保持 unknown 兜底
        const validTypes = ["lab_report", "encounter_note", "imaging_report", "dental_record", "immunization_record"] as const;
        type ValidType = (typeof validTypes)[number];
        const docType = validTypes.find((t) => t === parsed.documentType);
        if (docType) {
          result = {
            documentType: docType as ValidType,
            confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.8,
            reasoning: String(parsed.reasoning ?? "视觉分类"),
          };
        } else {
          result = {
            documentType: "unknown",
            confidence: 0.8,
            reasoning: `视觉分类结果为 ${String(parsed.documentType ?? "other")}，按未分类处理`,
          };
        }
      } catch (e) {
        console.error("[classify] Failed to classify image:", e);
      }
    }

    await db
      .update(importJobs)
      .set({
        classifiedType: result.documentType,
        classificationConfidence: result.confidence,
        classifyCompletedAt: new Date(),
      })
      .where(eq(importJobs.id, ctx.importJobId));
    await db
      .update(sourceArtifacts)
      .set({
        classifiedType: result.documentType,
        classificationConfidence: result.confidence,
      })
      .where(eq(sourceArtifacts.id, ctx.artifactId));
    return result;
  }

  // Quick heuristic for CSV files
  if (artifact.mimeType === "text/csv") {
    const result: ClassificationResult = {
      documentType: "csv_export",
      confidence: 0.95,
      reasoning: "File is CSV format",
    };
    await db
      .update(importJobs)
      .set({
        classifiedType: result.documentType,
        classificationConfidence: result.confidence,
        classifyCompletedAt: new Date(),
      })
      .where(eq(importJobs.id, ctx.importJobId));
    await db
      .update(sourceArtifacts)
      .set({
        classifiedType: result.documentType,
        classificationConfidence: result.confidence,
      })
      .where(eq(sourceArtifacts.id, ctx.artifactId));
    return result;
  }

  // Quick heuristic for Apple Health exports (ZIP files with known naming pattern)
  if (
    (artifact.mimeType === "application/zip" ||
      artifact.mimeType === "application/x-zip-compressed") &&
    /(?:export|apple.?health)/i.test(artifact.fileName)
  ) {
    const result: ClassificationResult = {
      documentType: "apple_health_export",
      confidence: 0.95,
      reasoning: "ZIP file with Apple Health export naming pattern",
    };
    await db
      .update(importJobs)
      .set({
        classifiedType: result.documentType,
        classificationConfidence: result.confidence,
        classifyCompletedAt: new Date(),
      })
      .where(eq(importJobs.id, ctx.importJobId));
    await db
      .update(sourceArtifacts)
      .set({
        classifiedType: result.documentType,
        classificationConfidence: result.confidence,
      })
      .where(eq(sourceArtifacts.id, ctx.artifactId));
    return result;
  }

  // Download and extract text
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

  let textContent = "";
  if (artifact.mimeType === "application/pdf") {
    const { extractTextFromPdf } = await import("../lib/pdf");
    textContent = await extractTextFromPdf(buffer);
  } else if (artifact.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const mammoth = await import("mammoth");
    textContent = (await mammoth.extractRawText({ buffer })).value;
  } else {
    textContent = buffer.toString("utf-8");
  }

  // Save extracted text
  await db
    .update(sourceArtifacts)
    .set({ rawTextExtracted: textContent.slice(0, 50000) })
    .where(eq(sourceArtifacts.id, ctx.artifactId));

  // Classify with AI
  const modelId =
    process.env.AI_DEFAULT_MODEL ?? "anthropic/claude-sonnet-4-20250514";

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

  let result: ClassificationResult;
  if (forcedDocumentType) {
    // PDF/text still needs extraction for the module candidate parser.
    result = { documentType: forcedDocumentType, confidence: 1, reasoning: "Module-specific import type" };
  } else try {
    const { text } = await generateText({
      model: resolveModel(userRow?.aiModel ?? modelId, channel
        ? { baseUrl: channel.baseUrl, apiKey: channel.apiKey, protocol: channel.protocol }
        : undefined),
      system: classifyDocumentPrompt,
      prompt: `Document type: ${artifact.mimeType}\nFile name: ${artifact.fileName}\n\nContent:\n${textContent.slice(0, 10000)}`,
    });
    // Strip markdown code fences if present
    const jsonStr = text
      .replace(/^```(?:json)?\s*\n?/m, "")
      .replace(/\n?```\s*$/m, "")
      .trim();
    const parsed = JSON.parse(jsonStr);
    result = {
      documentType: parsed.documentType ?? "unknown",
      confidence:
        typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      reasoning: parsed.reasoning ?? "",
    };
  } catch (e) {
    console.error("[classify] Failed to classify document:", e);
    result = {
      documentType: "unknown",
      confidence: 0.3,
      reasoning: "Failed to parse AI response",
    };
  }

  // Update DB
  await db
    .update(importJobs)
    .set({
      classifiedType: result.documentType,
      classificationConfidence: result.confidence,
      classifyCompletedAt: new Date(),
    })
    .where(eq(importJobs.id, ctx.importJobId));
  await db
    .update(sourceArtifacts)
    .set({
      classifiedType: result.documentType,
      classificationConfidence: result.confidence,
    })
    .where(eq(sourceArtifacts.id, ctx.artifactId));

  return result;
}
