import { getDb } from "@openvitals/database/client";
import { importJobs, sourceArtifacts } from "@openvitals/database";
import { eq } from "drizzle-orm";
import type { WorkflowContext } from "../workflow";
import type { ParseResult } from "@openvitals/ingestion";
import { parseLabPdf } from "../parsers/lab-pdf";
import { parseLabImage } from "../parsers/lab-image";
import { parseCsvImport } from "../parsers/csv-importer";
import { parseAppleHealthExport } from "../parsers/apple-health-xml";

export async function parse(
  ctx: WorkflowContext,
  documentType: string,
): Promise<ParseResult> {
  const db = getDb();

  await db
    .update(importJobs)
    .set({ status: "parsing" })
    .where(eq(importJobs.id, ctx.importJobId));

  console.log(
    `[parse] Parsing as ${documentType} for artifact=${ctx.artifactId}`,
  );

  // lab_report：按 mimeType 分流，image/* → 视觉解析器，否则 PDF/文本解析器
  let parser: ((ctx: WorkflowContext) => Promise<ParseResult>) | undefined;
  if (documentType === "lab_report") {
    const [artifact] = await db
      .select({ mimeType: sourceArtifacts.mimeType })
      .from(sourceArtifacts)
      .where(eq(sourceArtifacts.id, ctx.artifactId))
      .limit(1);
    parser =
      artifact && artifact.mimeType.startsWith("image/")
        ? parseLabImage
        : parseLabPdf;
  } else {
    const parserMap: Record<
      string,
      (ctx: WorkflowContext) => Promise<ParseResult>
    > = {
      csv_export: parseCsvImport,
      apple_health_export: parseAppleHealthExport,
    };
    parser = parserMap[documentType];
  }

  if (!parser) {
    console.warn(
      `[parse] No parser for type ${documentType}, returning empty result`,
    );
    return { extractions: [] };
  }

  const result = await parser(ctx);

  await db
    .update(importJobs)
    .set({
      parseCompletedAt: new Date(),
      parserId: documentType,
      parserVersion: "0.1.0",
    })
    .where(eq(importJobs.id, ctx.importJobId));

  return result;
}
