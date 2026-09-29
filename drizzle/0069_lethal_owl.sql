ALTER TABLE "oauth_tokens" ADD COLUMN "family_id" uuid;--> statement-breakpoint
ALTER TABLE "oauth_tokens" ADD COLUMN "family_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "token_hash" text;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_sessions_token_hash" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
UPDATE "oauth_tokens" SET "scopes" = array_append("scopes", 'account:manage') WHERE "client_id" = 'bissbilanz-mobile' AND NOT ('account:manage' = ANY("scopes"));
