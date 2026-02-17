CREATE TYPE "public"."schedule_type" AS ENUM('daily', 'every_other_day', 'weekly', 'specific_days');--> statement-breakpoint
CREATE TABLE "supplement_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplement_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"taken_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "supplements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"dosage" real NOT NULL,
	"dosage_unit" text NOT NULL,
	"schedule_type" "schedule_type" NOT NULL,
	"schedule_days" integer[],
	"schedule_start_date" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_foods_barcode";--> statement-breakpoint
ALTER TABLE "supplement_logs" ADD CONSTRAINT "supplement_logs_supplement_id_supplements_id_fk" FOREIGN KEY ("supplement_id") REFERENCES "public"."supplements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplement_logs" ADD CONSTRAINT "supplement_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplements" ADD CONSTRAINT "supplements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_supplement_logs_unique" ON "supplement_logs" USING btree ("supplement_id","date");--> statement-breakpoint
CREATE INDEX "idx_supplement_logs_user_date" ON "supplement_logs" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "idx_supplement_logs_supplement_id" ON "supplement_logs" USING btree ("supplement_id");--> statement-breakpoint
CREATE INDEX "idx_supplements_user_id" ON "supplements" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_supplements_user_active" ON "supplements" USING btree ("user_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_foods_barcode" ON "foods" USING btree ("barcode") WHERE barcode IS NOT NULL;