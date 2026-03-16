CREATE TABLE "day_properties" (
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"is_fasting_day" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "day_properties_user_id_date_pk" PRIMARY KEY("user_id","date")
);
--> statement-breakpoint
ALTER TABLE "day_properties" ADD CONSTRAINT "day_properties_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_day_properties_user_date" ON "day_properties" USING btree ("user_id","date");