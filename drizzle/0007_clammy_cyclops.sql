ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "is_favorite" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "image_url" text;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "favorite_tap_action" text DEFAULT 'instant' NOT NULL;