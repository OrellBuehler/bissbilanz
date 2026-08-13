CREATE TABLE "identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"subject" text NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "uq_identities_provider_subject" UNIQUE("provider","subject")
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "infomaniak_sub" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "identities" ADD CONSTRAINT "identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_identities_user_id" ON "identities" USING btree ("user_id");--> statement-breakpoint
INSERT INTO "identities" ("user_id", "provider", "subject", "email")
SELECT "id", 'infomaniak', "infomaniak_sub", "email" FROM "users" WHERE "infomaniak_sub" IS NOT NULL
ON CONFLICT ("provider", "subject") DO NOTHING;