ALTER TABLE "user_preferences" ADD COLUMN "ai_research_nutrients" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "ai_web_research" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "ai_real_servings" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "ai_task_create_foods" boolean DEFAULT true NOT NULL;