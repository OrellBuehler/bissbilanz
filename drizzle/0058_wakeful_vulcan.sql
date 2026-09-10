CREATE TABLE "uploads" (
	"filename" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "uploads_user_id_idx" ON "uploads" USING btree ("user_id");--> statement-breakpoint
-- Freeze unambiguous legacy references once. Never infer ownership at request time.
-- Historical claims cannot be authenticated retroactively; shared filenames are
-- deliberately left unclaimed for operator review rather than granting either user access.
WITH legacy AS (
    SELECT image_url AS url, user_id FROM foods WHERE image_url LIKE '/uploads/%'
    UNION ALL
    SELECT image_url AS url, user_id FROM recipes WHERE image_url LIKE '/uploads/%'
    UNION ALL
    SELECT unnest(photo_urls) AS url, user_id FROM ai_tasks
)
INSERT INTO uploads (filename, user_id)
SELECT substring(url FROM 10), min(user_id::text)::uuid
FROM legacy
WHERE url ~ '^/uploads/[a-f0-9-]+\.webp$'
GROUP BY url
HAVING count(DISTINCT user_id) = 1
ON CONFLICT DO NOTHING;
