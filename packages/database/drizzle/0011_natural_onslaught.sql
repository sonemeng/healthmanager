ALTER TABLE "profiles" ADD COLUMN "blood_type" varchar(5);--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "allergies" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "emergency_contact_name" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "emergency_contact_phone" varchar(50);--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "primary_care_provider" text;--> statement-breakpoint
ALTER TABLE "share_policies" ADD COLUMN "profile_id" text;--> statement-breakpoint
UPDATE "share_policies" AS policy
SET "profile_id" = profile."id"
FROM "profiles" AS profile
WHERE policy."profile_id" IS NULL
  AND profile."user_id" = policy."user_id"
  AND profile."is_default" = true;--> statement-breakpoint
ALTER TABLE "share_policies" ADD CONSTRAINT "share_policies_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
