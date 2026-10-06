-- Parse transparency + report batching (see docs 05).
-- NOTE: schema drift from handwritten migrations 0012/0014/0015 (family_history,
-- user_optimal_ranges.profile_id, user_retest_settings.profile_id) is NOT re-applied
-- here — those statements were deliberately trimmed from the generated file to avoid
-- duplicate-ALTER failures on databases that already ran 0012-0015. The drizzle meta
-- snapshot 0016_snapshot.json still records the full current schema state.
ALTER TABLE "import_jobs" ADD COLUMN "batch_id" text;--> statement-breakpoint
ALTER TABLE "observations" ADD COLUMN "observed_at_is_fallback" boolean DEFAULT false NOT NULL;
