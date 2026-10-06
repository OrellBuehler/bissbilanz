CREATE TABLE "recipe_labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"source" "label_source" NOT NULL,
	"confidence" real,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "recipe_labels_confidence_range" CHECK ("recipe_labels"."confidence" IS NULL OR ("recipe_labels"."confidence" >= 0 AND "recipe_labels"."confidence" <= 1))
);
--> statement-breakpoint
ALTER TABLE "recipe_labels" ADD CONSTRAINT "recipe_labels_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_labels" ADD CONSTRAINT "recipe_labels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_recipe_labels_recipe_label" ON "recipe_labels" USING btree ("recipe_id","label");--> statement-breakpoint
CREATE INDEX "idx_recipe_labels_user_label" ON "recipe_labels" USING btree ("user_id","label");--> statement-breakpoint
CREATE INDEX "idx_recipe_labels_recipe_id" ON "recipe_labels" USING btree ("recipe_id");