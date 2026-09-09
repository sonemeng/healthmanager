import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { createRouter, protectedProcedure } from "../init";
import {
  createImportJob,
  getImportJobStatus,
  listImportJobs,
  deleteImportJob,
  getReviewQueue,
  listObservationsByImportJob,
  resetImportJobsForReprocessing,
  findImportJobByContentHash,
  resetImportJob,
  importJobs,
  type Database,
} from "@openvitals/database";
import { getActiveProfileId } from "../active-profile";

type WorkerTriggerParams = {
  importJobId: string;
  artifactId: string;
  userId: string;
  source: string;
};

async function triggerWorker(db: Database, params: WorkerTriggerParams) {
  const workerUrl = process.env.RENDER_WORKER_URL ?? "http://localhost:4000";
  const webhookSecret =
    process.env.RENDER_WEBHOOK_SECRET ?? "dev-secret-change-me";

  try {
    const response = await fetch(`${workerUrl}/api/workflows/trigger`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${webhookSecret}`,
      },
      body: JSON.stringify({
        importJobId: params.importJobId,
        artifactId: params.artifactId,
        userId: params.userId,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Worker returned ${response.status}${body ? `: ${body}` : ""}`,
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(importJobs)
      .set({
        status: "failed",
        errorMessage: `Failed to trigger ingestion worker: ${message}`,
        updatedAt: new Date(),
      })
      .where(eq(importJobs.id, params.importJobId));

    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: `${params.source}: failed to trigger ingestion worker`,
      cause: err,
    });
  }
}

export const importJobsRouter = createRouter({
  create: protectedProcedure
    .input(
      z.object({
        fileName: z.string(),
        mimeType: z.string(),
        blobPath: z.string(),
        contentHash: z.string(),
        fileSize: z.number(),
        dataSourceId: z.string().uuid().optional(),
        profileId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check for duplicate document
      const existing = await findImportJobByContentHash(ctx.db, {
        userId: ctx.userId,
        contentHash: input.contentHash,
      });

      if (existing) {
        return {
          duplicate: true as const,
          existingJobId: existing.importJobId,
          existingStatus: existing.status,
          existingFileName: existing.fileName,
        };
      }

      const result = await createImportJob(ctx.db, {
        userId: ctx.userId,
        profileId: input.profileId ?? null,
        fileName: input.fileName,
        mimeType: input.mimeType,
        blobPath: input.blobPath,
        contentHash: input.contentHash,
        fileSize: input.fileSize,
        dataSourceId: input.dataSourceId,
      });

      await triggerWorker(ctx.db, {
        importJobId: result.importJobId,
        artifactId: result.sourceArtifactId,
        userId: ctx.userId,
        source: "importJobs.create",
      });

      return { duplicate: false as const, importJobId: result.importJobId };
    }),

  getStatus: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const job = await getImportJobStatus(ctx.db, {
        id: input.id,
        userId: ctx.userId,
      });

      if (!job) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Import job not found",
        });
      }

      return {
        status: job.status,
        classifiedType: job.classifiedType,
        classificationConfidence: job.classificationConfidence,
        extractionCount: job.extractionCount ?? 0,
        needsReview: job.needsReview ?? false,
        errorMessage: job.errorMessage,
        createdAt: job.createdAt!,
        parseCompletedAt: job.parseCompletedAt,
      };
    }),

  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        status: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const profileId = await getActiveProfileId(ctx.userId);
      const items = await listImportJobs(ctx.db, {
        userId: ctx.userId,
        profileId,
        limit: input.limit,
        status: input.status,
      });
      return { items };
    }),

  getDetail: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const job = await getImportJobStatus(ctx.db, {
        id: input.id,
        userId: ctx.userId,
      });
      if (!job) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Import job not found",
        });
      }
      const observations = await listObservationsByImportJob(ctx.db, {
        importJobId: input.id,
        userId: ctx.userId,
      });
      return { job, observations };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await deleteImportJob(ctx.db, {
        id: input.id,
        userId: ctx.userId,
      });
      if (!deleted) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Import job not found",
        });
      }
      return { success: true };
    }),

  reviewQueue: protectedProcedure.query(async ({ ctx }) => {
    const items = await getReviewQueue(ctx.db, { userId: ctx.userId });
    return { items };
  }),

  reprocess: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const job = await resetImportJob(ctx.db, {
        id: input.id,
        userId: ctx.userId,
      });

      if (!job) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Import job not found",
        });
      }

      await triggerWorker(ctx.db, {
        importJobId: job.id,
        artifactId: job.sourceArtifactId,
        userId: ctx.userId,
        source: "importJobs.reprocess",
      });

      return { importJobId: job.id };
    }),

  reprocessAll: protectedProcedure.mutation(async ({ ctx }) => {
    const result = await resetImportJobsForReprocessing(ctx.db, {
      userId: ctx.userId,
    });

    if (result.count === 0) {
      return { count: 0 };
    }

    let triggered = 0;
    let failed = 0;
    for (const job of result.jobs!) {
      try {
        await triggerWorker(ctx.db, {
          importJobId: job.id,
          artifactId: job.sourceArtifactId,
          userId: ctx.userId,
          source: "importJobs.reprocessAll",
        });
        triggered++;
      } catch (err) {
        failed++;
        console.error(
          `[importJobs.reprocessAll] Failed to trigger worker for job=${job.id}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    return { count: result.count, triggered, failed };
  }),
});
