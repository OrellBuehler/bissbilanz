ALTER TABLE "foods" ADD COLUMN "server_modified_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "size_bytes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_foods_user_server_modified" ON "foods" USING btree ("user_id","server_modified_at","id");--> statement-breakpoint
CREATE OR REPLACE FUNCTION foods_set_server_modified_at() RETURNS trigger AS $$
BEGIN
	NEW.server_modified_at := clock_timestamp();
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER foods_server_modified_at BEFORE INSERT OR UPDATE ON "foods" FOR EACH ROW EXECUTE FUNCTION foods_set_server_modified_at();
