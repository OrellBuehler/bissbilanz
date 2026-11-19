ALTER TABLE "oauth_tokens" ADD COLUMN "access_token_used_at" timestamp with time zone;--> statement-breakpoint
-- Tokens issued before first use was recorded count as used, so replaying an older
-- refresh token of an existing chain still revokes the family.
UPDATE "oauth_tokens" SET "access_token_used_at" = COALESCE("created_at", now()) WHERE "access_token_used_at" IS NULL;
