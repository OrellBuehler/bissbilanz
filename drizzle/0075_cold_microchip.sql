CREATE TABLE "food_enrichment_jobs" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"processed" integer DEFAULT 0 NOT NULL,
	"updated" integer DEFAULT 0 NOT NULL,
	"not_found" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"cursor" uuid,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "food_enrichment_jobs_state_valid" CHECK ("food_enrichment_jobs"."state" IN ('queued', 'running', 'completed', 'cancelled', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "off_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "food_enrichment_jobs" ADD CONSTRAINT "food_enrichment_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_food_enrichment_jobs_state" ON "food_enrichment_jobs" USING btree ("state","lease_expires_at");