# Production DB Performance Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add production-safe database connection tuning, pagination, and search/index improvements to keep performance predictable as usage grows.

**Architecture:** Centralize database connection settings in env parsing, wire them into the postgres client, add pagination to list endpoints, and add Postgres indexes (btree + trigram GIN) via migrations. Batch session cleanup to avoid long-running deletes.

**Tech Stack:** SvelteKit, Bun, Drizzle ORM, postgres-js, PostgreSQL

### Task 1: Add database connection config parsing

**Files:**
- Modify: `src/lib/server/env.ts`
- Modify: `.env.example`
- Test: `tests/server/env.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { parseDatabaseConfig } from '../../src/lib/server/env';

describe('parseDatabaseConfig', () => {
	test('uses defaults when env vars are missing', () => {
		const config = parseDatabaseConfig({
			DATABASE_URL: 'postgres://user:pass@localhost:5432/bissbilanz'
		});

		expect(config.poolMax).toBe(10);
		expect(config.idleTimeoutSeconds).toBe(30);
		expect(config.connectTimeoutSeconds).toBe(10);
		expect(config.statementTimeoutMs).toBe(30_000);
		expect(config.maxLifetimeSeconds).toBe(300);
		expect(config.applicationName).toBe('bissbilanz');
	});

	test('parses numeric overrides', () => {
		const config = parseDatabaseConfig({
			DATABASE_URL: 'postgres://user:pass@localhost:5432/bissbilanz',
			DATABASE_POOL_MAX: '25',
			DATABASE_IDLE_TIMEOUT_SECONDS: '60',
			DATABASE_CONNECT_TIMEOUT_SECONDS: '5',
			DATABASE_STATEMENT_TIMEOUT_MS: '5000',
			DATABASE_MAX_LIFETIME_SECONDS: '600',
			DATABASE_APPLICATION_NAME: 'bissbilanz-prod'
		});

		expect(config.poolMax).toBe(25);
		expect(config.idleTimeoutSeconds).toBe(60);
		expect(config.connectTimeoutSeconds).toBe(5);
		expect(config.statementTimeoutMs).toBe(5000);
		expect(config.maxLifetimeSeconds).toBe(600);
		expect(config.applicationName).toBe('bissbilanz-prod');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/server/env.test.ts`  
Expected: FAIL with "parseDatabaseConfig is not defined"

**Step 3: Write minimal implementation**

```ts
type DatabaseEnv = Record<string, string | undefined>;

const toNumber = (value: string | undefined, fallback: number) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

export const parseDatabaseConfig = (env: DatabaseEnv) => ({
	url: env.DATABASE_URL!,
	poolMax: toNumber(env.DATABASE_POOL_MAX, 10),
	idleTimeoutSeconds: toNumber(env.DATABASE_IDLE_TIMEOUT_SECONDS, 30),
	connectTimeoutSeconds: toNumber(env.DATABASE_CONNECT_TIMEOUT_SECONDS, 10),
	statementTimeoutMs: toNumber(env.DATABASE_STATEMENT_TIMEOUT_MS, 30_000),
	maxLifetimeSeconds: toNumber(env.DATABASE_MAX_LIFETIME_SECONDS, 300),
	applicationName: env.DATABASE_APPLICATION_NAME ?? 'bissbilanz'
});

export const config = {
	database: parseDatabaseConfig(process.env),
	infomaniak: {
		clientId: process.env.INFOMANIAK_CLIENT_ID!,
		clientSecret: process.env.INFOMANIAK_CLIENT_SECRET!,
		redirectUri: process.env.INFOMANIAK_REDIRECT_URI!
	},
	session: {
		secret: process.env.SESSION_SECRET!
	},
	app: {
		url: process.env.PUBLIC_APP_URL!
	}
};
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/server/env.test.ts`  
Expected: PASS

**Step 5: Update env example**

```env
DATABASE_POOL_MAX=10
DATABASE_IDLE_TIMEOUT_SECONDS=30
DATABASE_CONNECT_TIMEOUT_SECONDS=10
DATABASE_STATEMENT_TIMEOUT_MS=30000
DATABASE_MAX_LIFETIME_SECONDS=300
DATABASE_APPLICATION_NAME=bissbilanz
```

**Step 6: Commit**

```bash
git add tests/server/env.test.ts src/lib/server/env.ts .env.example
git commit -m "chore: add database connection config defaults"
```

### Task 2: Wire postgres client options

**Files:**
- Modify: `src/lib/server/db.ts`

**Step 1: Implement postgres options**

```ts
const client = postgres(config.database.url, {
	max: config.database.poolMax,
	idle_timeout: config.database.idleTimeoutSeconds,
	connect_timeout: config.database.connectTimeoutSeconds,
	statement_timeout: config.database.statementTimeoutMs,
	max_lifetime: config.database.maxLifetimeSeconds,
	connection: {
		application_name: config.database.applicationName
	}
});
```

**Step 2: Manual verification**

Run: `bun run dev`  
Expected: App boots and DB operations succeed.

**Step 3: Commit**

```bash
git add src/lib/server/db.ts
git commit -m "chore: tune postgres client defaults"
```

### Task 3: Add pagination validation schema

**Files:**
- Create: `src/lib/server/validation/pagination.ts`
- Modify: `src/lib/server/validation/index.ts`
- Modify: `tests/server/validation.test.ts`

**Step 1: Write the failing test**

```ts
import { paginationSchema } from '../../src/lib/server/validation';

test('paginationSchema applies defaults and bounds', () => {
	const parsed = paginationSchema.parse({ limit: undefined, offset: undefined });
	expect(parsed.limit).toBe(100);
	expect(parsed.offset).toBe(0);
});

test('paginationSchema coerces numeric values', () => {
	const parsed = paginationSchema.parse({ limit: '20', offset: '10' });
	expect(parsed.limit).toBe(20);
	expect(parsed.offset).toBe(10);
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/server/validation.test.ts`  
Expected: FAIL with "paginationSchema is not defined"

**Step 3: Write minimal implementation**

```ts
import { z } from 'zod';

const coerceOptionalNumber = (fallback: number) =>
	z.preprocess(
		(value) => (value === undefined || value === null || value === '' ? undefined : value),
		z.coerce.number().int().min(0).default(fallback)
	);

export const paginationSchema = z.object({
	limit: z.preprocess(
		(value) => (value === undefined || value === null || value === '' ? undefined : value),
		z.coerce.number().int().min(1).max(200).default(100)
	),
	offset: coerceOptionalNumber(0)
});
```

**Step 4: Export from validation index**

```ts
export * from './pagination';
```

**Step 5: Run test to verify it passes**

Run: `bun test tests/server/validation.test.ts`  
Expected: PASS

**Step 6: Commit**

```bash
git add src/lib/server/validation/pagination.ts src/lib/server/validation/index.ts tests/server/validation.test.ts
git commit -m "feat: add pagination validation"
```

### Task 4: Add pagination to foods list and API

**Files:**
- Modify: `src/lib/server/foods.ts`
- Modify: `src/routes/api/foods/+server.ts`

**Step 1: Update listFoods signature and query**

```ts
export const listFoods = async (
	userId: string,
	options?: { query?: string; limit?: number; offset?: number }
) => {
	const db = getDB();
	const limit = options?.limit ?? 100;
	const offset = options?.offset ?? 0;
	const whereClause = options?.query
		? and(eq(foods.userId, userId), ilike(foods.name, `%${options.query}%`))
		: eq(foods.userId, userId);

	return db
		.select()
		.from(foods)
		.where(whereClause)
		.orderBy(foods.name)
		.limit(limit)
		.offset(offset);
};
```

**Step 2: Parse pagination in foods API**

```ts
import { paginationSchema } from '$lib/server/validation';

const query = url.searchParams.get('q') ?? undefined;
const { limit, offset } = paginationSchema.parse({
	limit: url.searchParams.get('limit'),
	offset: url.searchParams.get('offset')
});

const foods = await listFoods(locals.user.id, { query, limit, offset });
```

**Step 3: Manual verification**

Run: `curl "http://localhost:5173/api/foods?limit=10&offset=0"`  
Expected: Response contains at most 10 foods.

**Step 4: Commit**

```bash
git add src/lib/server/foods.ts src/routes/api/foods/+server.ts
git commit -m "feat: add pagination to foods list"
```

### Task 5: Add pagination to entries list and API

**Files:**
- Modify: `src/lib/server/entries.ts`
- Modify: `src/routes/api/entries/+server.ts`

**Step 1: Update listEntriesByDate signature and query**

```ts
export const listEntriesByDate = async (
	userId: string,
	date: string,
	options?: { limit?: number; offset?: number }
) => {
	const db = getDB();
	const limit = options?.limit ?? 100;
	const offset = options?.offset ?? 0;

	return db
		.select({
			id: foodEntries.id,
			mealType: foodEntries.mealType,
			servings: foodEntries.servings,
			notes: foodEntries.notes,
			foodId: foodEntries.foodId,
			foodName: foods.name,
			calories: foods.calories,
			protein: foods.protein,
			carbs: foods.carbs,
			fat: foods.fat,
			fiber: foods.fiber
		})
		.from(foodEntries)
		.leftJoin(foods, eq(foodEntries.foodId, foods.id))
		.where(and(eq(foodEntries.userId, userId), eq(foodEntries.date, date)))
		.limit(limit)
		.offset(offset);
};
```

**Step 2: Parse pagination in entries API**

```ts
import { paginationSchema } from '$lib/server/validation';

const date = url.searchParams.get('date');
const { limit, offset } = paginationSchema.parse({
	limit: url.searchParams.get('limit'),
	offset: url.searchParams.get('offset')
});

const entries = await listEntriesByDate(locals.user.id, date, { limit, offset });
```

**Step 3: Manual verification**

Run: `curl "http://localhost:5173/api/entries?date=2026-02-04&limit=10"`  
Expected: Response contains at most 10 entries for the date.

**Step 4: Commit**

```bash
git add src/lib/server/entries.ts src/routes/api/entries/+server.ts
git commit -m "feat: add pagination to entries list"
```

### Task 6: Add indexes for food name search and ordering

**Files:**
- Modify: `src/lib/server/schema.ts`
- Create: `drizzle/2026-02-04_add_foods_search_indexes.sql`

**Step 1: Add composite btree index for ordering**

```ts
export const foods = pgTable(
	'foods',
	{
		// columns omitted
	},
	(table) => [
		index('idx_foods_user_id').on(table.userId),
		index('idx_foods_barcode').on(table.barcode),
		index('idx_foods_user_name').on(table.userId, table.name)
	]
);
```

**Step 2: Create migration for pg_trgm + GIN index**

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_foods_name_trgm
ON foods
USING gin (name gin_trgm_ops);
```

**Step 3: Run migration generation**

Run: `bun run db:generate`  
Expected: New migration file created in `drizzle/`

**Step 4: Ensure migration ordering**

Place `2026-02-04_add_foods_search_indexes.sql` after generated btree index migration so both apply cleanly.

**Step 5: Verify in development**

Run: `bun run db:push`  
Expected: Migration applies without errors.

**Step 6: Commit**

```bash
git add src/lib/server/schema.ts drizzle/2026-02-04_add_foods_search_indexes.sql drizzle/*
git commit -m "feat: add foods search indexes"
```

### Task 7: Batch expired session cleanup

**Files:**
- Modify: `src/lib/server/session.ts`

**Step 1: Update cleanup to batch deletions**

```ts
import { eq, inArray, lt } from 'drizzle-orm';

export async function cleanExpiredSessions(batchSize = 500): Promise<number> {
	const db = getDB();
	const expired = await db
		.select({ id: sessions.id })
		.from(sessions)
		.where(lt(sessions.expiresAt, new Date()))
		.limit(batchSize);

	if (expired.length === 0) return 0;

	const ids = expired.map((row) => row.id);
	await db.delete(sessions).where(inArray(sessions.id, ids));
	return ids.length;
}
```

**Step 2: Manual verification**

Run: `bun test`  
Expected: PASS

**Step 3: Commit**

```bash
git add src/lib/server/session.ts
git commit -m "feat: batch expired session cleanup"
```
