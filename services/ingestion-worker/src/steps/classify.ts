import { generateText } from "ai";
import { getDb } from "@openvitals/database/client";
import { importJobs, sourceArtifacts, users, aiChannels } from "@openvitals/database";
import { and, eq } from "drizzle-orm";
import { classifyDocumentPrompt, resolveModel } from "@openvitals/ai";
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

  // Image classification needs vision input. Files with no extractable text are
  // routed to the reviewable candidate parser rather than being assumed to be labs.
  if (artifact.mimeType.startsWith("image/")) {
    const result: ClassificationResult = {
      documentType: forcedDocumentType ?? "unknown",
      confidence: forcedDocumentType ? 1 : 0.8,
      reasoning: forcedDocumentType ? "Module-specific import type" : "Image file, routed to reviewable health-record extraction",
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
