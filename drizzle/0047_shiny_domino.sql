CREATE TYPE "public"."label_source" AS ENUM('user', 'llm', 'external', 'catalog');--> statement-breakpoint
CREATE TABLE "food_labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"food_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"source" "label_source" NOT NULL,
	"confidence" real,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "food_labels_confidence_range" CHECK ("food_labels"."confidence" IS NULL OR ("food_labels"."confidence" >= 0 AND "food_labels"."confidence" <= 1))
);
--> statement-breakpoint
ALTER TABLE "food_labels" ADD CONSTRAINT "food_labels_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_labels" ADD CONSTRAINT "food_labels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_food_labels_food_label" ON "food_labels" USING btree ("food_id","label");--> statement-breakpoint
CREATE INDEX "idx_food_labels_user_label" ON "food_labels" USING btree ("user_id","label");--> statement-breakpoint
CREATE INDEX "idx_food_labels_food_id" ON "food_labels" USING btree ("food_id");