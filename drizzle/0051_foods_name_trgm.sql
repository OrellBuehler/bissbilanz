CREATE INDEX IF NOT EXISTS "idx_foods_name_trgm" ON "foods" USING gin ("name" gin_trgm_ops);
