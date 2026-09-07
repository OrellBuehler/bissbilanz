ALTER TABLE "user_goals" ADD COLUMN "target_weight" real;--> statement-breakpoint
ALTER TABLE "user_goals" ADD COLUMN "target_date" date;--> statement-breakpoint
ALTER TABLE "user_goals" ADD CONSTRAINT "user_goals_target_weight_range" CHECK ("user_goals"."target_weight" IS NULL OR ("user_goals"."target_weight" > 0 AND "user_goals"."target_weight" <= 500));