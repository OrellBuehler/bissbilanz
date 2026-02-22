CREATE TABLE "supplement_ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplement_id" uuid NOT NULL,
	"name" text NOT NULL,
	"dosage" real NOT NULL,
	"dosage_unit" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "supplement_ingredients" ADD CONSTRAINT "supplement_ingredients_supplement_id_supplements_id_fk" FOREIGN KEY ("supplement_id") REFERENCES "public"."supplements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_supplement_ingredients_supplement_id" ON "supplement_ingredients" USING btree ("supplement_id");