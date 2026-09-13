import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
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
  medications,
  conditions,
  encounters,
  sourceArtifacts,
  profiles,
  type Database,
} from "@openvitals/database";
import { getActiveProfileId } from "../active-profile";

type WorkerTriggerParams = {
  importJobId: string;
  artifactId: string;
  userId: string;
  source: string;
};

const candidateSchema = z.discriminatedUnion("kind", [
  z.object({
    id: z.string(),
    kind: z.literal("medication"),
    status: z.enum(["pending", "confirmed", "rejected"]),
    name: z.string(),
    dosage: z.string().optional(),
    frequency: z.string().optional(),
    indication: z.string().optional(),
    startDate: z.string().optional(),
  }),
  z.object({
    id: z.string(),
    kind: z.literal("condition"),
    status: z.enum(["pending", "confirmed", "rejected"]),
    name: z.string(),
    severity: z.enum(["mild", "moderate", "severe"]).optional(),
    onsetDate: z.string().optional(),
    notes: z.string().optional(),
  }),
  z.object({
    id: z.string(),
    kind: z.literal("encounter"),
    status: z.enum(["pending", "confirmed", "rejected"]),
    type: z.enum(["checkup", "specialist", "urgent_care", "emergency", "telehealth", "lab_visit", "imaging", "dental", "therapy", "other"]),
    encounterDate: z.string(),
    provider: z.string().optional(),
    facility: z.string().optional(),
    chiefComplaint: z.string().optional(),
    summary: z.string().optional(),
  }),
]);

const candidateDetailsSchema = z.object({
  candidates: z.array(candidateSchema),
}).passthrough();

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
        documentType: z.enum(["encounter_note", "imaging_report", "dental_record", "immunization_record"]).optional(),
        importTarget: z.enum(["medication", "condition", "encounter"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const profileId = input.profileId ?? await getActiveProfileId(ctx.userId);
      if (!profileId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "请先选择健康档案后再导入报告",
        });
      }

      const [profile] = await ctx.db
        .select({ id: profiles.id })
        .from(profiles)
        .where(and(eq(profiles.id, profileId), eq(profiles.userId, ctx.userId)))
        .limit(1);
      if (!profile) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "不能向不属于当前账号的健康档案导入报告",
        });
      }

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
        profileId,
        fileName: input.fileName,
        mimeType: input.mimeType,
        blobPath: input.blobPath,
        contentHash: input.contentHash,
        fileSize: input.fileSize,
        dataSourceId: input.dataSourceId,
      });

      // Module-specific imports intentionally bypass generic classification.
      // This keeps a prescription, medical history, or visit note in its own review flow.
      if (input.documentType) {
        await ctx.db.update(importJobs).set({
          classifiedType: input.documentType,
          classificationConfidence: 1,
          errorDetailJson: input.importTarget ? { importTarget: input.importTarget } : undefined,
        }).where(eq(importJobs.id, result.importJobId));
      }

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

  moduleRecent: protectedProcedure
    .input(z.object({ target: z.enum(["medication", "condition", "encounter"]) }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: importJobs.id,
          status: importJobs.status,
          extractionCount: importJobs.extractionCount,
          needsReview: importJobs.needsReview,
          errorMessage: importJobs.errorMessage,
          errorDetailJson: importJobs.errorDetailJson,
          createdAt: importJobs.createdAt,
          fileName: sourceArtifacts.fileName,
        })
        .from(importJobs)
        .innerJoin(sourceArtifacts, eq(importJobs.sourceArtifactId, sourceArtifacts.id))
        .where(eq(importJobs.userId, ctx.userId))
        .orderBy(importJobs.createdAt)
        .limit(30);

      return rows
        .filter((row) => (row.errorDetailJson as Record<string, unknown> | null)?.importTarget === input.target)
        .slice(0, 5);
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

  resolveCandidate: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      candidateId: z.string(),
      action: z.enum(["confirm", "reject"]),
      updates: z.record(z.string(), z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [job] = await ctx.db
        .select()
        .from(importJobs)
        .where(and(eq(importJobs.id, input.id), eq(importJobs.userId, ctx.userId)))
        .limit(1);
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Import job not found" });

      const parsed = candidateDetailsSchema.safeParse(job.errorDetailJson);
      if (!parsed.success) throw new TRPCError({ code: "NOT_FOUND", message: "Candidate record not found" });
      const candidates = parsed.data.candidates;
      const index = candidates.findIndex((candidate) => candidate.id === input.candidateId);
      const candidate = candidates[index];
      if (!candidate || candidate.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Candidate record is no longer pending" });
      }

      const editable = input.updates ?? {};
      const updatedCandidate = candidate.kind === "medication"
        ? { ...candidate, name: editable.name?.trim() || candidate.name, dosage: editable.dosage?.trim() || undefined, frequency: editable.frequency?.trim() || undefined, indication: editable.indication?.trim() || undefined, startDate: editable.startDate?.trim() || undefined }
        : candidate.kind === "condition"
          ? { ...candidate, name: editable.name?.trim() || candidate.name, onsetDate: editable.onsetDate?.trim() || undefined, notes: editable.notes?.trim() || undefined }
          : { ...candidate, encounterDate: editable.encounterDate?.trim() || candidate.encounterDate, provider: editable.provider?.trim() || undefined, facility: editable.facility?.trim() || undefined, chiefComplaint: editable.chiefComplaint?.trim() || undefined, summary: editable.summary?.trim() || undefined };

      const profileId = (await getActiveProfileId(ctx.userId)) ?? null;
      if (input.action === "confirm") {
        if (updatedCandidate.kind === "medication") {
          await ctx.db.insert(medications).values({
            userId: ctx.userId, profileId, name: updatedCandidate.name, dosage: updatedCandidate.dosage,
            frequency: updatedCandidate.frequency, indication: updatedCandidate.indication, startDate: updatedCandidate.startDate,
            status: "extracted", sourceArtifactId: job.sourceArtifactId, importJobId: job.id,
          });
        } else if (updatedCandidate.kind === "condition") {
          await ctx.db.insert(conditions).values({
            userId: ctx.userId, profileId, name: updatedCandidate.name, severity: updatedCandidate.severity,
            onsetDate: updatedCandidate.onsetDate, notes: updatedCandidate.notes,
            sourceArtifactId: job.sourceArtifactId, importJobId: job.id,
          });
        } else {
          await ctx.db.insert(encounters).values({
            userId: ctx.userId, profileId, type: updatedCandidate.type, encounterDate: updatedCandidate.encounterDate,
            provider: updatedCandidate.provider, facility: updatedCandidate.facility, chiefComplaint: updatedCandidate.chiefComplaint,
            summary: updatedCandidate.summary, sourceArtifactId: job.sourceArtifactId, importJobId: job.id,
          });
        }
      }

      candidates[index] = { ...updatedCandidate, status: input.action === "confirm" ? "confirmed" : "rejected" } as typeof candidate;
      const hasPending = candidates.some((item) => item.status === "pending");
      await ctx.db.update(importJobs).set({
        errorDetailJson: { ...parsed.data, candidates },
        needsReview: hasPending,
        status: hasPending ? "review_needed" : "completed",
        completedAt: hasPending ? null : new Date(),
        updatedAt: new Date(),
      }).where(eq(importJobs.id, job.id));

      return { success: true };
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
