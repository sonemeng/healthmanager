-- Repair data created before health records were scoped to a member profile.
-- Every account has exactly one owner profile; only that profile receives legacy rows.
WITH ranked_profiles AS (
  SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY created_at, id) AS rank
  FROM "profiles"
  WHERE "is_default" = true
)
UPDATE "profiles" AS profile
SET "is_default" = false
FROM ranked_profiles AS ranked
WHERE profile.id = ranked.id AND ranked.rank > 1;--> statement-breakpoint

INSERT INTO "profiles" ("id", "user_id", "name", "avatar_color", "is_default", "sort_order")
SELECT gen_random_uuid()::text, "users"."id", COALESCE(NULLIF("users"."name", ''), '本人'), '#18a058', true, 0
FROM "users"
LEFT JOIN "profiles" AS owner_profile
  ON owner_profile."user_id" = "users"."id" AND owner_profile."is_default" = true
WHERE owner_profile."id" IS NULL;--> statement-breakpoint

UPDATE "profiles" AS profile
SET
  "name" = COALESCE(NULLIF(profile."name", ''), NULLIF("users"."name", ''), '本人'),
  "gender" = COALESCE(profile."gender", "users"."biological_sex"),
  "birth_date" = COALESCE(profile."birth_date", "users"."date_of_birth"),
  "blood_type" = COALESCE(profile."blood_type", "users"."blood_type"),
  "updated_at" = now()
FROM "users"
WHERE profile."user_id" = "users"."id" AND profile."is_default" = true;--> statement-breakpoint

UPDATE "import_jobs" AS row SET "profile_id" = owner_profile."id"
FROM "profiles" AS owner_profile
WHERE row."user_id" = owner_profile."user_id" AND owner_profile."is_default" = true AND row."profile_id" IS NULL;--> statement-breakpoint
UPDATE "observations" AS row SET "profile_id" = owner_profile."id"
FROM "profiles" AS owner_profile
WHERE row."user_id" = owner_profile."user_id" AND owner_profile."is_default" = true AND row."profile_id" IS NULL;--> statement-breakpoint
UPDATE "medications" AS row SET "profile_id" = owner_profile."id"
FROM "profiles" AS owner_profile
WHERE row."user_id" = owner_profile."user_id" AND owner_profile."is_default" = true AND row."profile_id" IS NULL;--> statement-breakpoint
UPDATE "conditions" AS row SET "profile_id" = owner_profile."id"
FROM "profiles" AS owner_profile
WHERE row."user_id" = owner_profile."user_id" AND owner_profile."is_default" = true AND row."profile_id" IS NULL;--> statement-breakpoint
UPDATE "encounters" AS row SET "profile_id" = owner_profile."id"
FROM "profiles" AS owner_profile
WHERE row."user_id" = owner_profile."user_id" AND owner_profile."is_default" = true AND row."profile_id" IS NULL;--> statement-breakpoint

CREATE UNIQUE INDEX "profiles_one_default_per_user_idx" ON "profiles" USING btree ("user_id") WHERE "is_default" = true;
