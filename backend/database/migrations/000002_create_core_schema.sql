-- +goose Up
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE measurement_units (
    id              BIGSERIAL PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE,
    symbol          TEXT NOT NULL UNIQUE,
    quantity        TEXT,
    description     TEXT
);

CREATE TABLE nutrient_groups (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    description TEXT
);

CREATE TABLE data_sources (
    id           BIGSERIAL PRIMARY KEY,
    name         TEXT NOT NULL,
    type         TEXT NOT NULL,
    endpoint_url TEXT,
    license      TEXT,
    notes        TEXT,
    UNIQUE (name, type)
);

CREATE TABLE import_batches (
    id           BIGSERIAL PRIMARY KEY,
    source_id    BIGINT NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
    imported_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version      TEXT,
    raw_file_path TEXT,
    status       TEXT NOT NULL DEFAULT 'completed'
);

CREATE TABLE nutrient_definitions (
    id            BIGSERIAL PRIMARY KEY,
    code          TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    group_id      BIGINT REFERENCES nutrient_groups(id) ON DELETE SET NULL,
    unit_id       BIGINT NOT NULL REFERENCES measurement_units(id) ON DELETE RESTRICT,
    daily_value   NUMERIC(18,6),
    description   TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE nutrient_aliases (
    id           BIGSERIAL PRIMARY KEY,
    nutrient_id  BIGINT NOT NULL REFERENCES nutrient_definitions(id) ON DELETE CASCADE,
    source_id    BIGINT NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
    code         TEXT NOT NULL,
    name         TEXT,
    UNIQUE (nutrient_id, source_id, code)
);

CREATE TABLE foods (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_name      TEXT NOT NULL,
    generic_name        TEXT,
    brand_name          TEXT,
    category_path       TEXT,
    is_product          BOOLEAN NOT NULL DEFAULT FALSE,
    default_unit_id     BIGINT NOT NULL REFERENCES measurement_units(id) ON DELETE RESTRICT,
    source_id           BIGINT REFERENCES data_sources(id) ON DELETE SET NULL,
    external_id         TEXT,
    data_quality_score  SMALLINT,
    last_verified_at    TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX foods_source_external_idx ON foods(source_id, external_id) WHERE external_id IS NOT NULL;

CREATE TABLE food_portions (
    id           BIGSERIAL PRIMARY KEY,
    food_id      UUID NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
    portion_name TEXT NOT NULL,
    quantity     NUMERIC(18,6) NOT NULL CHECK (quantity > 0),
    unit_id      BIGINT NOT NULL REFERENCES measurement_units(id) ON DELETE RESTRICT,
    gram_weight  NUMERIC(18,6),
    UNIQUE (food_id, portion_name)
);

CREATE TABLE food_categories (
    id        BIGSERIAL PRIMARY KEY,
    name      TEXT NOT NULL,
    parent_id BIGINT REFERENCES food_categories(id) ON DELETE SET NULL,
    UNIQUE (name, parent_id)
);

CREATE TABLE food_category_assignments (
    food_id     UUID NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
    category_id BIGINT NOT NULL REFERENCES food_categories(id) ON DELETE CASCADE,
    PRIMARY KEY (food_id, category_id)
);

CREATE TABLE food_source_records (
    id           BIGSERIAL PRIMARY KEY,
    food_id      UUID NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
    source_id    BIGINT NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
    external_id  TEXT,
    raw_payload  JSONB,
    batch_id     BIGINT REFERENCES import_batches(id) ON DELETE SET NULL,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX food_source_records_source_external_idx
    ON food_source_records(source_id, external_id)
    WHERE external_id IS NOT NULL;

CREATE TABLE food_nutrients (
    food_id           UUID NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
    nutrient_id       BIGINT NOT NULL REFERENCES nutrient_definitions(id) ON DELETE CASCADE,
    amount_per_100g   NUMERIC(18,6) NOT NULL CHECK (amount_per_100g >= 0),
    derivation_method TEXT,
    precision_source  TEXT,
    last_updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (food_id, nutrient_id)
);

CREATE TABLE food_nutrient_portions (
    portion_id BIGINT NOT NULL REFERENCES food_portions(id) ON DELETE CASCADE,
    nutrient_id BIGINT NOT NULL REFERENCES nutrient_definitions(id) ON DELETE CASCADE,
    amount     NUMERIC(18,6) NOT NULL CHECK (amount >= 0),
    PRIMARY KEY (portion_id, nutrient_id)
);

CREATE TABLE substances (
    id                BIGSERIAL PRIMARY KEY,
    code              TEXT UNIQUE,
    name              TEXT NOT NULL,
    description       TEXT,
    risk_level        TEXT,
    regulatory_status TEXT,
    substance_type    TEXT
);

CREATE TABLE substance_synonyms (
    id            BIGSERIAL PRIMARY KEY,
    substance_id  BIGINT NOT NULL REFERENCES substances(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    locale        TEXT,
    UNIQUE (substance_id, name, locale)
);

CREATE TABLE food_substances (
    food_id          UUID NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
    substance_id     BIGINT NOT NULL REFERENCES substances(id) ON DELETE CASCADE,
    amount_per_100g  NUMERIC(18,6) CHECK (amount_per_100g >= 0),
    source_id        BIGINT REFERENCES data_sources(id) ON DELETE SET NULL,
    notes            TEXT,
    PRIMARY KEY (food_id, substance_id)
);

CREATE TABLE studies (
    id                BIGSERIAL PRIMARY KEY,
    title             TEXT NOT NULL,
    abstract          TEXT,
    publication_date  DATE,
    doi_or_url        TEXT,
    source            TEXT,
    access_type       TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE study_substances (
    study_id      BIGINT NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
    substance_id  BIGINT NOT NULL REFERENCES substances(id) ON DELETE CASCADE,
    finding_type  TEXT NOT NULL,
    evidence_level TEXT,
    summary       TEXT,
    link_strength SMALLINT,
    PRIMARY KEY (study_id, substance_id)
);

CREATE TABLE study_foods (
    study_id     BIGINT NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
    food_id      UUID NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
    finding_type TEXT,
    summary      TEXT,
    PRIMARY KEY (study_id, food_id)
);

CREATE TABLE food_equivalents (
    primary_food_id   UUID NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
    equivalent_food_id UUID NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
    confidence        NUMERIC(5,4),
    notes             TEXT,
    PRIMARY KEY (primary_food_id, equivalent_food_id),
    CHECK (primary_food_id <> equivalent_food_id)
);

CREATE TABLE app_users (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email        TEXT UNIQUE,
    display_name TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_food_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    food_id         UUID NOT NULL REFERENCES foods(id) ON DELETE RESTRICT,
    logged_at       TIMESTAMPTZ NOT NULL,
    quantity_grams  NUMERIC(18,6) NOT NULL CHECK (quantity_grams >= 0),
    portion_id      BIGINT REFERENCES food_portions(id) ON DELETE SET NULL,
    notes           TEXT,
    source          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_food_log_tags (
    log_id UUID NOT NULL REFERENCES user_food_logs(id) ON DELETE CASCADE,
    tag    TEXT NOT NULL,
    PRIMARY KEY (log_id, tag)
);

-- +goose Down
DROP TABLE IF EXISTS user_food_log_tags;
DROP TABLE IF EXISTS user_food_logs;
DROP TABLE IF EXISTS app_users;
DROP TABLE IF EXISTS food_equivalents;
DROP TABLE IF EXISTS study_foods;
DROP TABLE IF EXISTS study_substances;
DROP TABLE IF EXISTS studies;
DROP TABLE IF EXISTS food_substances;
DROP TABLE IF EXISTS substance_synonyms;
DROP TABLE IF EXISTS substances;
DROP TABLE IF EXISTS food_nutrient_portions;
DROP TABLE IF EXISTS food_nutrients;
DROP TABLE IF EXISTS food_source_records;
DROP TABLE IF EXISTS food_category_assignments;
DROP TABLE IF EXISTS food_categories;
DROP TABLE IF EXISTS food_portions;
DROP TABLE IF EXISTS foods;
DROP TABLE IF EXISTS nutrient_aliases;
DROP TABLE IF EXISTS nutrient_definitions;
DROP TABLE IF EXISTS import_batches;
DROP TABLE IF EXISTS data_sources;
DROP TABLE IF EXISTS nutrient_groups;
DROP TABLE IF EXISTS measurement_units;
DROP EXTENSION IF EXISTS "pgcrypto";
