-- Enable pg_trgm extension for trigram-based text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN index for fast ILIKE searches on food names
CREATE INDEX IF NOT EXISTS idx_foods_name_trgm
ON foods
USING gin (name gin_trgm_ops);
