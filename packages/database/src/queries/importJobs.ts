import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { sourceArtifacts, importJobs } from "../schema/sources";
import { observations } from "../schema/observations";
import type { Database } from "../client";

export async function createImportJob(
  db: Database,
  params: {
    userId: string;
    profileId?: string | null;
    fileName: string;
    mimeType: string;
    blobPath: string;
    contentHash: string;
    fileSize: number;
    dataSourceId?: string;
    batchId?: string | null;
  },
) {
  return db.transaction(async (tx) => {
    const [artifact] = await tx
      .insert(sourceArtifacts)
      .values({
        userId: params.userId,
        fileName: params.fileName,
        mimeType: params.mimeType,
        blobPath: params.blobPath,
        contentHash: params.contentHash,
        fileSize: params.fileSize,
        dataSourceId: params.dataSourceId,
      })
      .returning();

    const [job] = await tx
      .insert(importJobs)
      .values({
        userId: params.userId,
        profileId: params.profileId ?? null,
        sourceArtifactId: artifact!.id,
        batchId: params.batchId ?? null,
        status: "pending",
      })
      .returning();

    return { importJobId: job!.id, sourceArtifactId: artifact!.id };
  });
}

// 详情页「原图对照 / 原始提取文本」需要 artifact 元信息
export async function getImportJobArtifact(
  db: Database,
  params: { id: string; userId: string },
) {
  const rows = await db
    .select({
      sourceArtifactId: sourceArtifacts.id,
      fileName: sourceArtifacts.fileName,
      mimeType: sourceArtifacts.mimeType,
      fileSize: sourceArtifacts.fileSize,
      rawTextExtracted: sourceArtifacts.rawTextExtracted,
      blobPath: sourceArtifacts.blobPath,
    })
    .from(importJobs)
    .innerJoin(
      sourceArtifacts,
      eq(importJobs.sourceArtifactId, sourceArtifacts.id),
    )
    .where(
      and(eq(importJobs.id, params.id), eq(importJobs.userId, params.userId)),
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function getImportJobStatus(
  db: Database,
  params: {
    id: string;
    userId: string;
  },
) {
  const rows = await db
    .select()
    .from(importJobs)
    .where(
      and(eq(importJobs.id, params.id), eq(importJobs.userId, params.userId)),
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function listImportJobs(
  db: Database,
  params: {
    userId: string;
    profileId?: string | null;
    limit?: number;
    status?: string;
    sortBy?: "createdAt" | "observedAt";
  },
) {
  const conditions: SQL[] = [eq(importJobs.userId, params.userId)];
  if (params.profileId) conditions.push(eq(importJobs.profileId, params.profileId));
  if (params.status) conditions.push(eq(importJobs.status, params.status));

  // 按检查时间排序时，无任何观测的 job 排最后（NULLS LAST）
  const minObservedAt = sql<Date | null>`(
    SELECT MIN(${observations.observedAt})
    FROM ${observations}
    WHERE ${observations.importJobId} = ${importJobs.id}
  )`;

  return db
    .select({
      id: importJobs.id,
      status: importJobs.status,
      classifiedType: importJobs.classifiedType,
      classificationConfidence: importJobs.classificationConfidence,
      extractionCount: importJobs.extractionCount,
      needsReview: importJobs.needsReview,
      errorMessage: importJobs.errorMessage,
      createdAt: importJobs.createdAt,
      parseCompletedAt: importJobs.parseCompletedAt,
      completedAt: importJobs.completedAt,
      fileName: sourceArtifacts.fileName,
      mimeType: sourceArtifacts.mimeType,
      fileSize: sourceArtifacts.fileSize,
      batchId: importJobs.batchId,
      observationCount: sql<number | null>`(
        SELECT COUNT(*)::int
        FROM ${observations}
        WHERE ${observations.importJobId} = ${importJobs.id}
      )`,
      abnormalCount: sql<number | null>`(
        SELECT COUNT(*)::int
        FROM ${observations}
        WHERE ${observations.importJobId} = ${importJobs.id}
          AND ${observations.isAbnormal} = true
      )`,
      minObservedAt,
      hasFallbackDate: sql<boolean | null>`(
        SELECT EXISTS (
          SELECT 1
          FROM ${observations}
          WHERE ${observations.importJobId} = ${importJobs.id}
            AND ${observations.observedAtIsFallback} = true
        )
      )`,
    })
    .from(importJobs)
    .innerJoin(
      sourceArtifacts,
      eq(importJobs.sourceArtifactId, sourceArtifacts.id),
    )
    .where(and(...conditions))
    .orderBy(
      params.sortBy === "observedAt"
        ? sql`${minObservedAt} DESC NULLS LAST`
        : desc(importJobs.createdAt),
    )
    .limit(params.limit ?? 20);
}

export async function deleteImportJob(
  db: Database,
  params: {
    id: string;
    userId: string;
  },
) {
  // 事务 + 先删 observations：observations.import_job_id 外键为 NO ACTION（无级联），
  // 若不先删观测，删除已解析出数据的任务会因外键冲突失败（2026-10-08 修复）。
  return db.transaction(async (tx) => {
    const [job] = await tx
      .select({
        id: importJobs.id,
        sourceArtifactId: importJobs.sourceArtifactId,
      })
      .from(importJobs)
      .where(
        and(eq(importJobs.id, params.id), eq(importJobs.userId, params.userId)),
      )
      .limit(1);

    if (!job) return null;

    await tx
      .delete(observations)
      .where(eq(observations.importJobId, job.id));

    await tx
      .delete(importJobs)
      .where(eq(importJobs.id, job.id));

    await tx
      .delete(sourceArtifacts)
      .where(eq(sourceArtifacts.id, job.sourceArtifactId));

    return job;
  });
}

export async function getReviewQueue(
  db: Database,
  params: {
    userId: string;
  },
) {
  return db
    .select({
      id: importJobs.id,
      status: importJobs.status,
      classifiedType: importJobs.classifiedType,
      classificationConfidence: importJobs.classificationConfidence,
      extractionCount: importJobs.extractionCount,
      errorMessage: importJobs.errorMessage,
      createdAt: importJobs.createdAt,
      fileName: sourceArtifacts.fileName,
      mimeType: sourceArtifacts.mimeType,
    })
    .from(importJobs)
    .innerJoin(
      sourceArtifacts,
      eq(importJobs.sourceArtifactId, sourceArtifacts.id),
    )
    .where(
      and(
        eq(importJobs.userId, params.userId),
        eq(importJobs.needsReview, true),
      ),
    )
    .orderBy(desc(importJobs.createdAt));
}

export async function findImportJobByContentHash(
  db: Database,
  params: {
    userId: string;
    contentHash: string;
  },
) {
  const rows = await db
    .select({
      importJobId: importJobs.id,
      status: importJobs.status,
      fileName: sourceArtifacts.fileName,
      createdAt: importJobs.createdAt,
    })
    .from(sourceArtifacts)
    .innerJoin(importJobs, eq(importJobs.sourceArtifactId, sourceArtifacts.id))
    .where(
      and(
        eq(sourceArtifacts.userId, params.userId),
        eq(sourceArtifacts.contentHash, params.contentHash),
      ),
    )
    .orderBy(desc(importJobs.createdAt))
    .limit(1);

  return rows[0] ?? null;
}

export async function resetImportJob(
  db: Database,
  params: {
    id: string;
    userId: string;
  },
) {
  return db.transaction(async (tx) => {
    // Verify the job belongs to the user
    const [job] = await tx
      .select({
        id: importJobs.id,
        sourceArtifactId: importJobs.sourceArtifactId,
      })
      .from(importJobs)
      .where(
        and(eq(importJobs.id, params.id), eq(importJobs.userId, params.userId)),
      )
      .limit(1);

    if (!job) return null;

    // Delete existing observations for this job
    await tx.delete(observations).where(eq(observations.importJobId, job.id));

    // Reset the job to pending
    const [updated] = await tx
      .update(importJobs)
      .set({
        status: "pending",
        classifiedType: null,
        classificationConfidence: null,
        parserId: null,
        parserVersion: null,
        extractionCount: 0,
        needsReview: false,
        errorMessage: null,
        errorDetailJson: null,
        startedAt: null,
        classifyCompletedAt: null,
        parseCompletedAt: null,
        normalizeCompletedAt: null,
        completedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(importJobs.id, job.id))
      .returning({
        id: importJobs.id,
        sourceArtifactId: importJobs.sourceArtifactId,
      });

    return updated ?? null;
  });
}

export async function resetImportJobsForReprocessing(
  db: Database,
  params: {
    userId: string;
  },
) {
  return db.transaction(async (tx) => {
    // Find all import jobs for this user that have been processed
    const jobs = await tx
      .select({
        id: importJobs.id,
        sourceArtifactId: importJobs.sourceArtifactId,
      })
      .from(importJobs)
      .where(eq(importJobs.userId, params.userId));

    if (jobs.length === 0) return { count: 0 };

    const jobIds = jobs.map((j) => j.id);

    // Delete all observations linked to these import jobs
    await tx
      .delete(observations)
      .where(inArray(observations.importJobId, jobIds));

    // Reset all import jobs to pending
    await tx
      .update(importJobs)
      .set({
        status: "pending",
        classifiedType: null,
        classificationConfidence: null,
        parserId: null,
        parserVersion: null,
        extractionCount: 0,
        needsReview: false,
        errorMessage: null,
        errorDetailJson: null,
        startedAt: null,
        classifyCompletedAt: null,
        parseCompletedAt: null,
        normalizeCompletedAt: null,
        completedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(importJobs.userId, params.userId));

    return { count: jobs.length, jobs };
  });
}
