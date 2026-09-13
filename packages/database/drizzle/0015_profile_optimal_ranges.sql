-- Personalized optimal ranges belong to a health profile, not the account.
ALTER TABLE "user_optimal_ranges" ADD COLUMN "profile_id" text;--> statement-breakpoint
UPDATE "user_optimal_ranges" AS range
SET "profile_id" = profile."id"
FROM "profiles" AS profile
WHERE range."user_id" = profile."user_id"
  AND profile."is_default" = true
  AND range."profile_id" IS NULL;--> statement-breakpoint
ALTER TABLE "user_optimal_ranges" ALTER COLUMN "profile_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_optimal_ranges" ADD CONSTRAINT "user_optimal_ranges_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_optimal_ranges" DROP CONSTRAINT "user_optimal_ranges_user_metric_uniq";--> statement-breakpoint
ALTER TABLE "user_optimal_ranges" ADD CONSTRAINT "user_optimal_ranges_user_profile_metric_uniq" UNIQUE("user_id", "profile_id", "metric_code");
