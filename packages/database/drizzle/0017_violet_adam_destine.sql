CREATE TABLE "user_dashboard_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"profile_id" text NOT NULL,
	"metric_code" varchar(50) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "user_dashboard_metrics_user_profile_metric_uniq" UNIQUE("user_id","profile_id","metric_code")
);
--> statement-breakpoint
CREATE TABLE "diet_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"profile_id" text,
	"batch_date" varchar(10) NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"model" varchar(200),
	"content_json" jsonb NOT NULL,
	"edited_json" jsonb,
	"edited_at" timestamp,
	"disclaimer_text" text
);
--> statement-breakpoint
ALTER TABLE "user_dashboard_metrics" ADD CONSTRAINT "user_dashboard_metrics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_dashboard_metrics" ADD CONSTRAINT "user_dashboard_metrics_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_dashboard_metrics" ADD CONSTRAINT "user_dashboard_metrics_metric_code_metric_definitions_id_fk" FOREIGN KEY ("metric_code") REFERENCES "public"."metric_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diet_plans" ADD CONSTRAINT "diet_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diet_plans" ADD CONSTRAINT "diet_plans_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_dashboard_metrics_idx" ON "user_dashboard_metrics" USING btree ("user_id","profile_id");--> statement-breakpoint
CREATE INDEX "diet_plans_user_profile_batch_idx" ON "diet_plans" USING btree ("user_id","profile_id","batch_date");