UPDATE "food_entries" SET "eaten_at" = "created_at" WHERE "eaten_at" IS NULL;--> statement-breakpoint
ALTER TABLE "food_entries" ALTER COLUMN "eaten_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "food_entries" ALTER COLUMN "eaten_at" SET NOT NULL;