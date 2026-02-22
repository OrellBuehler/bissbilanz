CREATE TABLE "favorite_meal_timeframes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"meal_type" text NOT NULL,
	"custom_meal_type_id" uuid,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "favorite_meal_timeframes_minute_bounds" CHECK ("favorite_meal_timeframes"."start_minute" >= 0 AND "favorite_meal_timeframes"."start_minute" <= 1439 AND "favorite_meal_timeframes"."end_minute" >= 1 AND "favorite_meal_timeframes"."end_minute" <= 1439),
	CONSTRAINT "favorite_meal_timeframes_valid_range" CHECK ("favorite_meal_timeframes"."start_minute" < "favorite_meal_timeframes"."end_minute")
);
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "favorite_meal_assignment_mode" text DEFAULT 'time_based' NOT NULL;--> statement-breakpoint
ALTER TABLE "favorite_meal_timeframes" ADD CONSTRAINT "favorite_meal_timeframes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite_meal_timeframes" ADD CONSTRAINT "favorite_meal_timeframes_custom_meal_type_id_custom_meal_types_id_fk" FOREIGN KEY ("custom_meal_type_id") REFERENCES "public"."custom_meal_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite_meal_timeframes" ADD CONSTRAINT "favorite_meal_timeframes_no_overlap_per_user" EXCLUDE USING gist (
	"user_id" WITH =,
	int4range("start_minute", "end_minute", '[)') WITH &&
);--> statement-breakpoint
CREATE INDEX "idx_favorite_meal_timeframes_user_id" ON "favorite_meal_timeframes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_favorite_meal_timeframes_custom_meal_type_id" ON "favorite_meal_timeframes" USING btree ("custom_meal_type_id");
