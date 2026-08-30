ALTER TABLE "ai_tasks" ADD COLUMN "photo_urls" text[];--> statement-breakpoint
UPDATE "ai_tasks" SET "photo_urls" = ARRAY["photo_url"] WHERE "photo_url" IS NOT NULL;
