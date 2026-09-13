-- Retest preferences belong to an individual health profile, never the account.
ALTER TABLE "user_retest_settings" ADD COLUMN "profile_id" text;--> statement-breakpoint
UPDATE "user_retest_settings" AS setting
SET "profile_id" = profile."id"
FROM "profiles" AS profile
WHERE setting."user_id" = profile."user_id"
  AND profile."is_default" = true
  AND setting."profile_id" IS NULL;--> statement-breakpoint
ALTER TABLE "user_retest_settings" ALTER COLUMN "profile_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_retest_settings" ADD CONSTRAINT "user_retest_settings_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_retest_settings" DROP CONSTRAINT "user_retest_settings_user_metric_uniq";--> statement-breakpoint
ALTER TABLE "user_retest_settings" ADD CONSTRAINT "user_retest_settings_user_profile_metric_uniq" UNIQUE("user_id", "profile_id", "metric_code");
