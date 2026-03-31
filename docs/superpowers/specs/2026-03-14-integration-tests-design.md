# Integration Tests for Deployment Confidence

**Date:** 2026-03-14
**Goal:** Catch migration failures, schema drift, and startup issues before they hit production.

## Infrastructure

- **Framework:** Vitest with `testcontainers` + `@testcontainers/postgresql` (PostgreSQL 18)
- **Directory:** `tests/integration-db/`
- **Config:** `vitest.integration.config.ts` (separate from unit test config)
- **Script:** `bun run test:integration-db`

Separate from existing unit/mock tests. Integration tests hit a real PostgreSQL instance; unit tests continue using mocked DB.

### Vitest Config (`vitest.integration.config.ts`)

- `include`: `tests/integration-db/**/*.test.ts`
- `globalSetup`: `tests/integration-db/setup.ts`
- `testTimeout`: 60000 (migrations and container ops are slow)
- Same `$lib` alias as main `vitest.config.ts`

### Dependencies

```bash
bun add -d testcontainers @testcontainers/postgresql
```

## Container Lifecycle

**Global setup** (`tests/integration-db/setup.ts`):

- Starts a `postgres:18` Testcontainers container with a random port
- Sets `DATABASE_URL` env var for the test process
- Tears down the container after all tests complete

**Helpers** (`tests/integration-db/helpers.ts`):

- `getTestDB()` — creates a Drizzle instance using postgres.js (`postgres(url)`) connected to the test container URL from `DATABASE_URL` env var. This uses the same driver as production.
- `runTestMigrations(db)` — calls `migrate(db, { migrationsFolder: './drizzle' })` from `drizzle-orm/postgres-js/migrator` directly against the provided DB instance (avoids coupling to the singleton in `db.ts`).
- `createTestDatabase(name)` — runs `CREATE DATABASE` via the container's root connection, returns a new connection URL. Used for per-test-file isolation.

### Test Isolation

Each test file gets its own database within the shared container:

- Global setup starts one PostgreSQL container
- Each test file's `beforeAll` calls `createTestDatabase('test_<suitename>')` to create a fresh database
- Each test file's `afterAll` drops its database
- This ensures test execution order doesn't matter

## Test Suites

### 1. Migration Integrity (`migrations-integrity.test.ts`)

- Run all migrations from scratch on a clean DB
- Verify no errors thrown
- Query `__drizzle_migrations` table (in `public` schema) to confirm all 28 migrations are recorded
- Verify key tables exist (`users`, `foods`, `food_entries`, `recipes`, `sessions`, `oauth_clients`, etc.)

### 2. Migration Idempotency (`migrations-idempotency.test.ts`)

- Run all migrations once
- Run `migrate()` again (simulating server restart)
- Verify no errors — matches production behavior where `runMigrations()` runs on every startup

### 3. Server Startup (`server-startup.test.ts`)

- Run the full init sequence: `runMigrations()`, `ensureMobileClient()`, `cleanExpiredSessions()`
- Verify all three complete without errors against a real DB
- Insert an expired session, run cleanup, verify it's deleted
- Verify `ensureMobileClient()` creates the expected OAuth client row

### 4. Seed Data Integrity (`seed-data.test.ts`)

- Run all migrations including `0024_seed_mobile_oauth_clients.sql`
- Query `oauth_clients` table, verify mobile OAuth clients exist with correct values
- Future seed migrations get a test here too

### 5. Schema-Code Alignment (`schema-alignment.test.ts`)

- Run migrations, then perform basic CRUD on each major table via Drizzle ORM
- Insert a row, select it back, update it, delete it
- Tables: `users`, `sessions`, `foods`, `food_entries`, `recipes`, `recipe_ingredients`, `weight_entries`, `supplements`, `supplement_logs`, `user_goals`, `user_preferences`, `custom_meal_types`, `favorite_meal_timeframes`, `oauth_clients`, `oauth_tokens`, `oauth_authorizations`, `oauth_authorization_codes`
- Verify foreign key cascades work (e.g., delete user → entries cascade)
- Catches column type mismatches, missing defaults, broken foreign keys

## CI Integration

**Workflow:** `.github/workflows/integration-tests.yml`

- **Trigger:** `pull_request` with `types: [opened, synchronize, ready_for_review]`
- **Condition:** `if: github.event.pull_request.draft == false` (skip draft PRs)
- **Runner:** `ubuntu-latest` (Docker available by default)
- **Steps:** Checkout → Setup Bun → `bun install` → `bun run test:integration-db`
- No Docker Compose or services block — Testcontainers handles container lifecycle
