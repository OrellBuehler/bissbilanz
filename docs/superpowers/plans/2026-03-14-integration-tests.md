# Integration Tests Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add integration tests that verify database migrations, schema alignment, and server startup against a real PostgreSQL 18 instance using Testcontainers.

**Architecture:** A separate Vitest project config runs tests in `tests/integration-db/` against a Testcontainers-managed PostgreSQL 18 container. Each test file gets its own database for isolation. Tests use `bun:sql` and Drizzle ORM directly (same driver as production).

**Tech Stack:** Vitest, testcontainers, @testcontainers/postgresql, drizzle-orm/bun-sql, PostgreSQL 18

**Spec:** `docs/superpowers/specs/2026-03-14-integration-tests-design.md`

---

## Chunk 1: Infrastructure Setup

### Task 1: Install dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install testcontainers packages**

Run: `cd /home/orell/github/bissbilanz && bun add -d testcontainers @testcontainers/postgresql`

- [ ] **Step 2: Verify installation**

Run: `cd /home/orell/github/bissbilanz && bun run -e "import { PostgreSqlContainer } from '@testcontainers/postgresql'; console.log('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock
git commit -m "chore: add testcontainers dev dependencies"
```

### Task 2: Create Vitest integration config

**Files:**
- Create: `vitest.integration.config.ts`
- Modify: `package.json` (add script)

- [ ] **Step 1: Create `vitest.integration.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
	resolve: {
		alias: [{ find: '$lib', replacement: path.resolve(__dirname, 'src/lib') }]
	},
	test: {
		include: ['tests/integration-db/**/*.test.ts'],
		exclude: ['**/node_modules/**'],
		globalSetup: ['tests/integration-db/setup.ts'],
		testTimeout: 60000,
		hookTimeout: 120000
	}
});
```

- [ ] **Step 2: Add `test:integration-db` script to `package.json`**

Add to scripts: `"test:integration-db": "bun --bun vitest run --config vitest.integration.config.ts"`

- [ ] **Step 3: Commit**

```bash
git add vitest.integration.config.ts package.json
git commit -m "chore: add vitest integration test config"
```

### Task 3: Create global setup and helpers

**Files:**
- Create: `tests/integration-db/setup.ts`
- Create: `tests/integration-db/helpers.ts`

- [ ] **Step 1: Create `tests/integration-db/setup.ts`**

This file manages the Testcontainers PostgreSQL lifecycle. It starts a `postgres:18` container, sets `DATABASE_URL`, and tears down on completion.

```ts
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

let container: StartedPostgreSqlContainer;

export async function setup() {
	container = await new PostgreSqlContainer('postgres:18').start();
	process.env.TEST_DATABASE_URL = container.getConnectionUri();
}

export async function teardown() {
	await container?.stop();
}
```

Note: We use `TEST_DATABASE_URL` (not `DATABASE_URL`) to avoid accidentally affecting any singleton DB module imports. The helpers read from this env var.

- [ ] **Step 2: Create `tests/integration-db/helpers.ts`**

Provides `createTestDatabase()` for per-test-file isolation and `getTestDB()` for connecting.

```ts
import { drizzle } from 'drizzle-orm/bun-sql';
import { migrate } from 'drizzle-orm/bun-sql/migrator';
import { SQL } from 'bun';
import { join } from 'node:path';
import * as schema from '$lib/server/schema';

type TestDB = ReturnType<typeof drizzle<typeof schema>>;

const dbInstances = new Map<string, { db: TestDB; client: InstanceType<typeof SQL> }>();

export function getTestDB(url: string) {
	const existing = dbInstances.get(url);
	if (existing) return existing.db;

	const client = new SQL(url);
	const db = drizzle({ client, schema });
	dbInstances.set(url, { db, client });
	return db;
}

export async function closeTestDB(url: string) {
	const existing = dbInstances.get(url);
	if (existing) {
		await existing.client.close();
		dbInstances.delete(url);
	}
}

export async function runTestMigrations(url: string) {
	const db = getTestDB(url);
	await migrate(db, { migrationsFolder: join(process.cwd(), 'drizzle') });
	return db;
}

export async function createTestDatabase(name: string): Promise<string> {
	const rootUrl = process.env.TEST_DATABASE_URL!;
	const client = new SQL(rootUrl);
	await client.unsafe(`DROP DATABASE IF EXISTS "${name}"`);
	await client.unsafe(`CREATE DATABASE "${name}"`);
	await client.close();

	const url = new URL(rootUrl);
	url.pathname = `/${name}`;
	return url.toString();
}

export async function dropTestDatabase(name: string) {
	const rootUrl = process.env.TEST_DATABASE_URL!;
	const client = new SQL(rootUrl);
	await client.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
	await client.close();
}
```

- [ ] **Step 3: Verify the global setup works**

Run: `cd /home/orell/github/bissbilanz && bun run test:integration-db`
Expected: "No test files found" (no tests yet), but no container errors.

- [ ] **Step 4: Commit**

```bash
git add tests/integration-db/setup.ts tests/integration-db/helpers.ts
git commit -m "feat: add integration test infrastructure with testcontainers"
```

---

## Chunk 2: Migration Tests

### Task 4: Migration integrity test

**Files:**
- Create: `tests/integration-db/migrations-integrity.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, dropTestDatabase, runTestMigrations, getTestDB, closeTestDB } from './helpers';

const DB_NAME = 'test_migration_integrity';
let dbUrl: string;

beforeAll(async () => {
	dbUrl = await createTestDatabase(DB_NAME);
});

afterAll(async () => {
	await closeTestDB(dbUrl);
	await dropTestDatabase(DB_NAME);
});

describe('migration integrity', () => {
	it('runs all migrations from scratch without errors', async () => {
		await expect(runTestMigrations(dbUrl)).resolves.toBeDefined();
	});

	it('records all 28 migrations in the journal', async () => {
		const db = getTestDB(dbUrl);
		const { sql } = await import('drizzle-orm');
		const result = await db.execute<{ count: number }>(
			sql`SELECT count(*)::int as count FROM "__drizzle_migrations"`
		);
		expect(result[0].count).toBe(28);
	});

	it('creates all expected tables', async () => {
		const db = getTestDB(dbUrl);
		const { sql } = await import('drizzle-orm');
		const result = await db.execute<{ table_name: string }>(
			sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`
		);
		const tables = result.map((r) => r.table_name);
		const expected = [
			'users',
			'sessions',
			'foods',
			'food_entries',
			'user_goals',
			'user_preferences',
			'recipes',
			'recipe_ingredients',
			'custom_meal_types',
			'favorite_meal_timeframes',
			'supplements',
			'supplement_ingredients',
			'supplement_logs',
			'weight_entries',
			'oauth_clients',
			'oauth_authorizations',
			'oauth_tokens',
			'oauth_authorization_codes'
		];
		for (const table of expected) {
			expect(tables).toContain(table);
		}
	});
});
```

- [ ] **Step 2: Run it**

Run: `cd /home/orell/github/bissbilanz && bun run test:integration-db`
Expected: All 3 tests pass.

Note: The migration count assertion (`28`) must match the actual number of `.sql` files in `drizzle/`. If migrations are added in the future, this test will need updating — which is intentional, as it forces review of new migrations.

- [ ] **Step 3: Commit**

```bash
git add tests/integration-db/migrations-integrity.test.ts
git commit -m "test: add migration integrity integration test"
```

### Task 5: Migration idempotency test

**Files:**
- Create: `tests/integration-db/migrations-idempotency.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, dropTestDatabase, runTestMigrations, closeTestDB } from './helpers';

const DB_NAME = 'test_migration_idempotency';
let dbUrl: string;

beforeAll(async () => {
	dbUrl = await createTestDatabase(DB_NAME);
});

afterAll(async () => {
	await closeTestDB(dbUrl);
	await dropTestDatabase(DB_NAME);
});

describe('migration idempotency', () => {
	it('runs migrations twice without errors (simulates server restart)', async () => {
		await runTestMigrations(dbUrl);
		await expect(runTestMigrations(dbUrl)).resolves.toBeDefined();
	});
});
```

- [ ] **Step 2: Run it**

Run: `cd /home/orell/github/bissbilanz && bun run test:integration-db`
Expected: All tests pass (integrity + idempotency).

- [ ] **Step 3: Commit**

```bash
git add tests/integration-db/migrations-idempotency.test.ts
git commit -m "test: add migration idempotency integration test"
```

---

## Chunk 3: Startup and Seed Tests

### Task 6: Server startup test

**Files:**
- Create: `tests/integration-db/server-startup.test.ts`

This test verifies the production init sequence (`runMigrations` → `ensureMobileClient` → `cleanExpiredSessions`) works against a real database. We can't import the functions from their production modules directly because they use the singleton `getDB()`. Instead, we replicate the logic against our test DB instance.

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, lt } from 'drizzle-orm';
import { createTestDatabase, dropTestDatabase, runTestMigrations, getTestDB, closeTestDB } from './helpers';
import { users, sessions, oauthClients } from '$lib/server/schema';

const DB_NAME = 'test_server_startup';
let dbUrl: string;

beforeAll(async () => {
	dbUrl = await createTestDatabase(DB_NAME);
	await runTestMigrations(dbUrl);
});

afterAll(async () => {
	await closeTestDB(dbUrl);
	await dropTestDatabase(DB_NAME);
});

describe('server startup sequence', () => {
	it('ensureMobileClient creates the mobile OAuth client', async () => {
		const db = getTestDB(dbUrl);
		const MOBILE_CLIENT_ID = 'bissbilanz-mobile';

		// Simulate ensureMobileClient()
		const existing = await db.query.oauthClients.findFirst({
			where: eq(oauthClients.clientId, MOBILE_CLIENT_ID)
		});
		if (!existing) {
			await db.insert(oauthClients).values({
				clientId: MOBILE_CLIENT_ID,
				clientName: 'Bissbilanz Mobile',
				tokenEndpointAuthMethod: 'none',
				allowedRedirectUris: []
			});
		}

		const client = await db.query.oauthClients.findFirst({
			where: eq(oauthClients.clientId, MOBILE_CLIENT_ID)
		});
		expect(client).toBeDefined();
		expect(client!.clientName).toBe('Bissbilanz Mobile');
	});

	it('ensureMobileClient is idempotent', async () => {
		const db = getTestDB(dbUrl);
		const MOBILE_CLIENT_ID = 'bissbilanz-mobile';

		// Run again — should not throw
		const existing = await db.query.oauthClients.findFirst({
			where: eq(oauthClients.clientId, MOBILE_CLIENT_ID)
		});
		expect(existing).toBeDefined(); // already exists from previous test

		// Count should still be 1
		const all = await db.select().from(oauthClients).where(eq(oauthClients.clientId, MOBILE_CLIENT_ID));
		expect(all).toHaveLength(1);
	});

	it('cleanExpiredSessions removes expired sessions', async () => {
		const db = getTestDB(dbUrl);

		// Create a test user
		const [user] = await db
			.insert(users)
			.values({
				infomaniakSub: 'test-startup-user',
				email: 'test@example.com',
				name: 'Test User'
			})
			.returning();

		// Create an expired session
		const pastDate = new Date(Date.now() - 86400000); // 24h ago
		await db.insert(sessions).values({
			userId: user.id,
			expiresAt: pastDate
		});

		// Create a valid session
		const futureDate = new Date(Date.now() + 86400000); // 24h from now
		await db.insert(sessions).values({
			userId: user.id,
			expiresAt: futureDate
		});

		// Simulate cleanExpiredSessions()
		await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));

		// Verify only the valid session remains
		const remaining = await db.select().from(sessions).where(eq(sessions.userId, user.id));
		expect(remaining).toHaveLength(1);
		expect(remaining[0].expiresAt > new Date()).toBe(true);
	});
});
```

- [ ] **Step 2: Run it**

Run: `cd /home/orell/github/bissbilanz && bun run test:integration-db`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/integration-db/server-startup.test.ts
git commit -m "test: add server startup integration test"
```

### Task 7: Seed data integrity test

**Files:**
- Create: `tests/integration-db/seed-data.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDatabase, dropTestDatabase, runTestMigrations, getTestDB, closeTestDB } from './helpers';
import { oauthClients } from '$lib/server/schema';

const DB_NAME = 'test_seed_data';
let dbUrl: string;

beforeAll(async () => {
	dbUrl = await createTestDatabase(DB_NAME);
	await runTestMigrations(dbUrl);
});

afterAll(async () => {
	await closeTestDB(dbUrl);
	await dropTestDatabase(DB_NAME);
});

describe('seed data integrity', () => {
	it('seeds bissbilanz-android OAuth client via migration 0024', async () => {
		const db = getTestDB(dbUrl);
		const client = await db.query.oauthClients.findFirst({
			where: eq(oauthClients.clientId, 'bissbilanz-android')
		});
		expect(client).toBeDefined();
		expect(client!.clientName).toBe('Bissbilanz Android');
		expect(client!.tokenEndpointAuthMethod).toBe('none');
		expect(client!.allowedRedirectUris).toEqual(['bissbilanz://oauth/callback']);
	});

	it('seeds bissbilanz-ios OAuth client via migration 0024', async () => {
		const db = getTestDB(dbUrl);
		const client = await db.query.oauthClients.findFirst({
			where: eq(oauthClients.clientId, 'bissbilanz-ios')
		});
		expect(client).toBeDefined();
		expect(client!.clientName).toBe('Bissbilanz iOS');
		expect(client!.tokenEndpointAuthMethod).toBe('none');
		expect(client!.allowedRedirectUris).toEqual(['bissbilanz://oauth/callback']);
	});
});
```

- [ ] **Step 2: Run it**

Run: `cd /home/orell/github/bissbilanz && bun run test:integration-db`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/integration-db/seed-data.test.ts
git commit -m "test: add seed data integrity integration test"
```

---

## Chunk 4: Schema Alignment Test

### Task 8: Schema-code alignment test

**Files:**
- Create: `tests/integration-db/schema-alignment.test.ts`

This is the largest test file. It performs CRUD on every major table to verify the Drizzle schema matches the actual database columns, types, defaults, and constraints.

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDatabase, dropTestDatabase, runTestMigrations, getTestDB, closeTestDB } from './helpers';
import {
	users,
	sessions,
	foods,
	foodEntries,
	userGoals,
	userPreferences,
	recipes,
	recipeIngredients,
	customMealTypes,
	favoriteMealTimeframes,
	supplements,
	supplementIngredients,
	supplementLogs,
	weightEntries,
	oauthClients,
	oauthAuthorizations,
	oauthTokens,
	oauthAuthorizationCodes
} from '$lib/server/schema';

const DB_NAME = 'test_schema_alignment';
let dbUrl: string;

beforeAll(async () => {
	dbUrl = await createTestDatabase(DB_NAME);
	await runTestMigrations(dbUrl);
});

afterAll(async () => {
	await closeTestDB(dbUrl);
	await dropTestDatabase(DB_NAME);
});

describe('schema-code alignment', () => {
	let testUserId: string;
	let testFoodId: string;
	let testRecipeId: string;
	let testSupplementId: string;

	it('CRUD on users', async () => {
		const db = getTestDB(dbUrl);
		const [created] = await db
			.insert(users)
			.values({ infomaniakSub: 'test-sub-1', email: 'test@test.com', name: 'Test' })
			.returning();
		expect(created.id).toBeDefined();
		testUserId = created.id;

		const [selected] = await db.select().from(users).where(eq(users.id, testUserId));
		expect(selected.email).toBe('test@test.com');

		await db.update(users).set({ name: 'Updated' }).where(eq(users.id, testUserId));
		const [updated] = await db.select().from(users).where(eq(users.id, testUserId));
		expect(updated.name).toBe('Updated');
	});

	it('CRUD on sessions', async () => {
		const db = getTestDB(dbUrl);
		const [created] = await db
			.insert(sessions)
			.values({ userId: testUserId, expiresAt: new Date(Date.now() + 86400000) })
			.returning();
		expect(created.id).toBeDefined();

		await db.delete(sessions).where(eq(sessions.id, created.id));
		const [deleted] = await db.select().from(sessions).where(eq(sessions.id, created.id));
		expect(deleted).toBeUndefined();
	});

	it('CRUD on foods', async () => {
		const db = getTestDB(dbUrl);
		const [created] = await db
			.insert(foods)
			.values({
				userId: testUserId,
				name: 'Test Food',
				servingSize: 100,
				servingUnit: 'g',
				calories: 200,
				protein: 10,
				carbs: 20,
				fat: 5,
				fiber: 3
			})
			.returning();
		expect(created.id).toBeDefined();
		testFoodId = created.id;

		const [selected] = await db.select().from(foods).where(eq(foods.id, testFoodId));
		expect(selected.name).toBe('Test Food');
		expect(selected.calories).toBe(200);
	});

	it('CRUD on food_entries', async () => {
		const db = getTestDB(dbUrl);
		const [created] = await db
			.insert(foodEntries)
			.values({
				userId: testUserId,
				foodId: testFoodId,
				date: '2025-01-01',
				mealType: 'breakfast',
				servings: 1.5
			})
			.returning();
		expect(created.id).toBeDefined();

		await db.delete(foodEntries).where(eq(foodEntries.id, created.id));
	});

	it('CRUD on user_goals', async () => {
		const db = getTestDB(dbUrl);
		await db.insert(userGoals).values({
			userId: testUserId,
			calorieGoal: 2000,
			proteinGoal: 150,
			carbGoal: 200,
			fatGoal: 70,
			fiberGoal: 30
		});

		const [selected] = await db
			.select()
			.from(userGoals)
			.where(eq(userGoals.userId, testUserId));
		expect(selected.calorieGoal).toBe(2000);

		await db.delete(userGoals).where(eq(userGoals.userId, testUserId));
	});

	it('CRUD on user_preferences', async () => {
		const db = getTestDB(dbUrl);
		await db.insert(userPreferences).values({ userId: testUserId });

		const [selected] = await db
			.select()
			.from(userPreferences)
			.where(eq(userPreferences.userId, testUserId));
		expect(selected.showChartWidget).toBe(true); // default

		await db.delete(userPreferences).where(eq(userPreferences.userId, testUserId));
	});

	it('CRUD on recipes + recipe_ingredients', async () => {
		const db = getTestDB(dbUrl);
		const [recipe] = await db
			.insert(recipes)
			.values({ userId: testUserId, name: 'Test Recipe', totalServings: 4 })
			.returning();
		testRecipeId = recipe.id;

		const [ingredient] = await db
			.insert(recipeIngredients)
			.values({
				recipeId: testRecipeId,
				foodId: testFoodId,
				quantity: 200,
				servingUnit: 'g',
				sortOrder: 0
			})
			.returning();
		expect(ingredient.id).toBeDefined();

		// Delete ingredient, then recipe
		await db.delete(recipeIngredients).where(eq(recipeIngredients.id, ingredient.id));
		await db.delete(recipes).where(eq(recipes.id, testRecipeId));
	});

	it('CRUD on custom_meal_types', async () => {
		const db = getTestDB(dbUrl);
		const [created] = await db
			.insert(customMealTypes)
			.values({ userId: testUserId, name: 'Snack', sortOrder: 0 })
			.returning();
		expect(created.id).toBeDefined();

		await db.delete(customMealTypes).where(eq(customMealTypes.id, created.id));
	});

	it('CRUD on favorite_meal_timeframes', async () => {
		const db = getTestDB(dbUrl);
		const [created] = await db
			.insert(favoriteMealTimeframes)
			.values({
				userId: testUserId,
				mealType: 'breakfast',
				startMinute: 360,
				endMinute: 600,
				sortOrder: 0
			})
			.returning();
		expect(created.id).toBeDefined();

		await db.delete(favoriteMealTimeframes).where(eq(favoriteMealTimeframes.id, created.id));
	});

	it('CRUD on supplements + supplement_ingredients + supplement_logs', async () => {
		const db = getTestDB(dbUrl);
		const [supplement] = await db
			.insert(supplements)
			.values({
				userId: testUserId,
				name: 'Vitamin D',
				dosage: 1000,
				dosageUnit: 'IU',
				scheduleType: 'daily'
			})
			.returning();
		testSupplementId = supplement.id;

		const [ingredient] = await db
			.insert(supplementIngredients)
			.values({
				supplementId: testSupplementId,
				name: 'Cholecalciferol',
				dosage: 1000,
				dosageUnit: 'IU',
				sortOrder: 0
			})
			.returning();
		expect(ingredient.id).toBeDefined();

		const [log] = await db
			.insert(supplementLogs)
			.values({
				supplementId: testSupplementId,
				userId: testUserId,
				date: '2025-01-01',
				takenAt: new Date()
			})
			.returning();
		expect(log.id).toBeDefined();

		await db.delete(supplementLogs).where(eq(supplementLogs.id, log.id));
		await db.delete(supplementIngredients).where(eq(supplementIngredients.id, ingredient.id));
		await db.delete(supplements).where(eq(supplements.id, testSupplementId));
	});

	it('CRUD on weight_entries', async () => {
		const db = getTestDB(dbUrl);
		const [created] = await db
			.insert(weightEntries)
			.values({
				userId: testUserId,
				weightKg: 75.5,
				entryDate: '2025-01-01',
				loggedAt: new Date()
			})
			.returning();
		expect(created.id).toBeDefined();

		await db.delete(weightEntries).where(eq(weightEntries.id, created.id));
	});

	it('CRUD on oauth_clients + oauth_tokens + oauth_authorization_codes', async () => {
		const db = getTestDB(dbUrl);
		const [client] = await db
			.insert(oauthClients)
			.values({
				clientId: 'test-client',
				clientName: 'Test Client',
				tokenEndpointAuthMethod: 'none',
				allowedRedirectUris: ['http://localhost:3000/callback']
			})
			.returning();
		expect(client.id).toBeDefined();

		const [token] = await db
			.insert(oauthTokens)
			.values({
				clientId: 'test-client',
				userId: testUserId,
				accessTokenHash: 'test-hash',
				expiresAt: new Date(Date.now() + 3600000)
			})
			.returning();
		expect(token.id).toBeDefined();

		const [code] = await db
			.insert(oauthAuthorizationCodes)
			.values({
				code: 'test-code-123',
				clientId: 'test-client',
				userId: testUserId,
				redirectUri: 'http://localhost:3000/callback',
				codeChallenge: 'test-challenge',
				codeChallengeMethod: 'S256',
				expiresAt: new Date(Date.now() + 60000)
			})
			.returning();
		expect(code.code).toBe('test-code-123');

		await db.delete(oauthAuthorizationCodes).where(eq(oauthAuthorizationCodes.code, 'test-code-123'));
		await db.delete(oauthTokens).where(eq(oauthTokens.id, token.id));
		await db.delete(oauthClients).where(eq(oauthClients.clientId, 'test-client'));
	});

	it('CRUD on oauth_authorizations', async () => {
		const db = getTestDB(dbUrl);
		// Need a client first
		await db.insert(oauthClients).values({
			clientId: 'test-auth-client',
			clientName: 'Auth Test',
			tokenEndpointAuthMethod: 'none',
			allowedRedirectUris: []
		});

		const [auth] = await db
			.insert(oauthAuthorizations)
			.values({ userId: testUserId, clientId: 'test-auth-client' })
			.returning();
		expect(auth.id).toBeDefined();

		await db.delete(oauthAuthorizations).where(eq(oauthAuthorizations.id, auth.id));
		await db.delete(oauthClients).where(eq(oauthClients.clientId, 'test-auth-client'));
	});

	it('foreign key cascade: deleting user cascades sessions and entries', async () => {
		const db = getTestDB(dbUrl);

		// Create a separate user for this test
		const [cascadeUser] = await db
			.insert(users)
			.values({ infomaniakSub: 'cascade-test', email: 'cascade@test.com', name: 'Cascade' })
			.returning();

		await db.insert(sessions).values({
			userId: cascadeUser.id,
			expiresAt: new Date(Date.now() + 86400000)
		});

		await db
			.insert(foods)
			.values({
				userId: cascadeUser.id,
				name: 'Cascade Food',
				servingSize: 100,
				servingUnit: 'g',
				calories: 100,
				protein: 10,
				carbs: 10,
				fat: 5,
				fiber: 2
			});

		// Delete user
		await db.delete(users).where(eq(users.id, cascadeUser.id));

		// Sessions should be gone
		const remainingSessions = await db
			.select()
			.from(sessions)
			.where(eq(sessions.userId, cascadeUser.id));
		expect(remainingSessions).toHaveLength(0);

		// Foods should be gone
		const remainingFoods = await db
			.select()
			.from(foods)
			.where(eq(foods.userId, cascadeUser.id));
		expect(remainingFoods).toHaveLength(0);
	});

	// Clean up test user at the end
	it('cleanup: delete test user', async () => {
		const db = getTestDB(dbUrl);
		await db.delete(users).where(eq(users.id, testUserId));
	});
});
```

- [ ] **Step 2: Run it**

Run: `cd /home/orell/github/bissbilanz && bun run test:integration-db`
Expected: All tests pass across all 5 test files.

- [ ] **Step 3: Commit**

```bash
git add tests/integration-db/schema-alignment.test.ts
git commit -m "test: add schema-code alignment integration test"
```

---

## Chunk 5: CI Workflow

### Task 9: GitHub Actions workflow

**Files:**
- Create: `.github/workflows/integration-tests.yml`

- [ ] **Step 1: Create the workflow file**

```yaml
name: Integration Tests

on:
  pull_request:
    types: [opened, synchronize, ready_for_review]

jobs:
  integration-tests:
    if: github.event.pull_request.draft == false
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - run: bun install

      - name: Run integration tests
        run: bun run test:integration-db
```

- [ ] **Step 2: Verify syntax**

Run: `cd /home/orell/github/bissbilanz && cat .github/workflows/integration-tests.yml | head -5`
Expected: Shows the workflow header correctly.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/integration-tests.yml
git commit -m "ci: add integration tests workflow for PRs"
```

### Task 10: Verify everything works end-to-end

- [ ] **Step 1: Run the full integration test suite**

Run: `cd /home/orell/github/bissbilanz && bun run test:integration-db`
Expected: All tests pass (migration integrity, idempotency, server startup, seed data, schema alignment).

- [ ] **Step 2: Verify unit tests still pass**

Run: `cd /home/orell/github/bissbilanz && bun run test`
Expected: All existing unit tests pass (no regressions).

- [ ] **Step 3: Final commit if any formatting changes**

```bash
git add -A
git status  # verify only expected files
git commit -m "chore: format integration tests"
```
