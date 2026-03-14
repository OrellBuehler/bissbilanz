# Integration Tests for Deployment Confidence

**Date:** 2026-03-14
**Goal:** Catch migration failures, schema drift, and startup issues before they hit production.

## Infrastructure

- **Framework:** Vitest with `@testcontainers/postgresql` (PostgreSQL 18)
- **Directory:** `tests/integration-db/`
- **Config:** `vitest.integration.config.ts` (separate from unit test config)
- **Script:** `bun run test:integration-db`

Separate from existing unit/mock tests. Integration tests hit a real PostgreSQL instance; unit tests continue using mocked DB.

## Container Lifecycle

**Global setup** (`tests/integration-db/setup.ts`):

- Starts a `postgres:18` Testcontainers container with a random port
- Sets `DATABASE_URL` env var for the test process
- Tears down the container after all tests complete

**Helpers** (`tests/integration-db/helpers.ts`):

- `getTestDB()` — creates a Drizzle instance connected to the test container
- `runTestMigrations()` — runs Drizzle migrations from `./drizzle` against the test DB

## Test Suites

### 1. Migration Integrity (`migrations-integrity.test.ts`)

- Run all migrations from scratch on a clean DB
- Verify no errors thrown
- Query `drizzle.__drizzle_migrations` to confirm all migrations are recorded
- Verify key tables exist (`users`, `foods`, `food_entries`, `recipes`, etc.)

### 2. Migration Idempotency (`migrations-idempotency.test.ts`)

- Run all migrations once
- Run `runMigrations()` again (simulating server restart)
- Verify no errors — matches production behavior where `runMigrations()` runs on every startup

### 3. Server Startup (`server-startup.test.ts`)

- Run the init sequence: `runMigrations()` then `cleanExpiredSessions()`
- Verify both complete without errors against a real DB
- Insert an expired session, run cleanup, verify it's deleted

### 4. Seed Data Integrity (`seed-data.test.ts`)

- Run all migrations including `0024_seed_mobile_oauth_clients.sql`
- Query `oauth_clients` table, verify mobile OAuth clients exist with correct values
- Future seed migrations get a test here too

### 5. Schema-Code Alignment (`schema-alignment.test.ts`)

- Run migrations, then perform basic CRUD on each major table via Drizzle ORM
- Insert a row, select it back, update it, delete it
- Tables: `users`, `foods`, `food_entries`, `recipes`, `recipe_ingredients`, `weight`, `supplements`, `supplement_logs`, `user_goals`, `user_preferences`, `custom_meal_types`
- Catches column type mismatches, missing defaults, broken foreign keys

## CI Integration

**Workflow:** `.github/workflows/integration-tests.yml`

- **Trigger:** `pull_request` with `types: [ready_for_review]` + label-based re-trigger
- **Runner:** `ubuntu-latest` (Docker available by default)
- **Steps:** Checkout → Setup Bun → `bun install` → `bun run test:integration-db`
- No Docker Compose or services block — Testcontainers handles container lifecycle

## Dependency

- `@testcontainers/postgresql` (dev dependency)
