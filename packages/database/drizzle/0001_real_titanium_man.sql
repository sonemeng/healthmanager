CREATE TABLE "reference_ranges" (
	"id" serial PRIMARY KEY NOT NULL,
	"metric_code" varchar(50) NOT NULL,
	"sex" varchar(10),
	"age_min" integer,
	"age_max" integer,
	"range_low" real,
	"range_high" real,
	"range_text" text,
	"source" varchar(100),
	CONSTRAINT "reference_ranges_metric_sex_age_uniq" UNIQUE("metric_code","sex","age_min","age_max")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "date_of_birth" date;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "biological_sex" varchar(10);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "blood_type" varchar(5);--> statement-breakpoint
ALTER TABLE "reference_ranges" ADD CONSTRAINT "reference_ranges_metric_code_metric_definitions_id_fk" FOREIGN KEY ("metric_code") REFERENCES "public"."metric_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reference_ranges_metric_code_idx" ON "reference_ranges" USING btree ("metric_code");