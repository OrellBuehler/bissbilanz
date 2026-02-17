CREATE TABLE "user_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"show_favorites_widget" boolean DEFAULT true NOT NULL,
	"show_supplements_widget" boolean DEFAULT true NOT NULL,
	"show_weight_widget" boolean DEFAULT true NOT NULL,
	"widget_order" text[] DEFAULT ARRAY['favorites', 'supplements', 'weight']::text[] NOT NULL,
	"start_page" text DEFAULT 'dashboard' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locale" text DEFAULT 'en';--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;