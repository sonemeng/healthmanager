import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { createRouter, protectedProcedure } from "../init";
import { profiles, users } from "@openvitals/database";

export const preferencesRouter = createRouter({
  get: protectedProcedure.query(async ({ ctx }) => {
    const [userRows, ownerProfiles] = await Promise.all([
      ctx.db
      .select({
        name: users.name,
        timezone: users.timezone,
        preferredUnits: users.preferredUnits,
        aiModel: users.aiModel,
        dateOfBirth: users.dateOfBirth,
        biologicalSex: users.biologicalSex,
        bloodType: users.bloodType,
        showOptimalRanges: users.showOptimalRanges,
        onboardingStep: users.onboardingStep,
        onboardingJson: users.onboardingJson,
      })
      .from(users)
      .where(eq(users.id, ctx.userId))
      .limit(1),
      ctx.db
        .select({ name: profiles.name, birthDate: profiles.birthDate, gender: profiles.gender, bloodType: profiles.bloodType })
        .from(profiles)
        .where(and(eq(profiles.userId, ctx.userId), eq(profiles.isDefault, true)))
        .limit(1),
    ]);

    return {
      name: ownerProfiles[0]?.name ?? userRows[0]?.name ?? "",
      timezone: userRows[0]?.timezone ?? "UTC",
      preferredUnits: userRows[0]?.preferredUnits ?? "metric",
      aiModel: userRows[0]?.aiModel ?? "claude-sonnet-4-20250514",
      dateOfBirth: ownerProfiles[0]?.birthDate ?? userRows[0]?.dateOfBirth ?? null,
      biologicalSex: ownerProfiles[0]?.gender ?? userRows[0]?.biologicalSex ?? null,
      bloodType: ownerProfiles[0]?.bloodType ?? userRows[0]?.bloodType ?? null,
      showOptimalRanges: userRows[0]?.showOptimalRanges ?? true,
      onboardingStep: userRows[0]?.onboardingStep ?? 0,
      onboardingJson: userRows[0]?.onboardingJson ?? null,
    };
  }),

  update: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(255).optional(),
        timezone: z.string().optional(),
        preferredUnits: z.enum(["metric", "imperial"]).optional(),
        aiModel: z.string().optional(),
        dateOfBirth: z.string().optional(),
        biologicalSex: z.enum(["male", "female", "intersex"]).optional(),
        bloodType: z
          .enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"])
          .optional(),
        onboardingStep: z.number().int().min(0).max(9).optional(),
        onboardingJson: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.transaction(async (tx) => {
        await tx
        .update(users)
        .set({
          ...(input.name !== undefined && { name: input.name }),
          ...(input.timezone !== undefined && { timezone: input.timezone }),
          ...(input.preferredUnits !== undefined && {
            preferredUnits: input.preferredUnits,
          }),
          ...(input.aiModel !== undefined && { aiModel: input.aiModel }),
          ...(input.dateOfBirth !== undefined && {
            dateOfBirth: input.dateOfBirth,
          }),
          ...(input.biologicalSex !== undefined && {
            biologicalSex: input.biologicalSex,
          }),
          ...(input.bloodType !== undefined && { bloodType: input.bloodType }),
          ...(input.onboardingStep !== undefined && {
            onboardingStep: input.onboardingStep,
          }),
          ...(input.onboardingJson !== undefined && {
            onboardingJson: input.onboardingJson,
          }),
          updatedAt: new Date(),
        })
        .where(eq(users.id, ctx.userId));
        await tx
          .update(profiles)
          .set({
            ...(input.name !== undefined && { name: input.name }),
            ...(input.dateOfBirth !== undefined && { birthDate: input.dateOfBirth }),
            ...(input.biologicalSex !== undefined && { gender: input.biologicalSex }),
            ...(input.bloodType !== undefined && { bloodType: input.bloodType }),
            updatedAt: new Date(),
          })
          .where(and(eq(profiles.userId, ctx.userId), eq(profiles.isDefault, true)));
      });

      return { success: true };
    }),
});
