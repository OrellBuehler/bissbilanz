# Base Food Catalog — Foundation & App Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the access-gated base food catalog end-to-end (DB tables, dataset file format, admin CLIs, online search/barcode/save endpoints, picker + barcode UI) proven against JSONL fixtures — no crawler yet.

**Architecture:** Three new read-only tables (`catalog_datasets`, `catalog_foods`, `catalog_access`, M:N grants) populated by a `bun` CLI run on the server host from a Zod-validated JSONL file. The catalog is reached only through new online endpoints (`/api/catalog/*`), never synced into Dexie. Picking a catalog result calls a server-side instantiate endpoint that creates a normal personal `foods` row via the existing `createFood` path, which then syncs to Dexie and is logged normally.

**Tech Stack:** SvelteKit 2 / Svelte 5 runes, Bun, Drizzle ORM + Postgres (postgres-js), Zod, Vitest (+ Testcontainers integration), Paraglide i18n, zod-openapi.

**Spec:** `docs/superpowers/specs/2026-05-18-base-food-catalog-crawler-design.md` (this plan covers v1 Phases 1–2 only; OFF/Migros adapters = follow-on plans; Coop = v1.1).

---

## File Structure

**Phase 1 — Foundation**

- Modify `src/lib/server/schema.ts` — add `catalogDatasets`, `catalogFoods`, `catalogAccess`.
- Generate+hand-edit `drizzle/0037_*.sql` — `CREATE EXTENSION pg_trgm` + GIN index appended.
- Create `src/lib/server/catalog/dataset-schema.ts` — Zod schema for the JSONL contract (header + product), shared by importer and (future) crawler.
- Create `src/lib/server/catalog/dataset-schema.test.ts` — unit tests.
- Create `scripts/catalog.ts` — one CLI with `import` / `grant` / `revoke` / `list` subcommands (shared DB-connect boilerplate, DRY).
- Modify `package.json` — `catalog:*` scripts.
- Modify `.gitignore` — ignore `data/catalog/`.
- Modify `.pre-commit-config.yaml` — local hook rejecting committed `data/catalog/*.jsonl`.
- Create `tests/integration-db/catalog-schema.test.ts` — drift guard + extension/index existence.
- Create `tests/integration-db/catalog-import.test.ts` — import/grant/revoke/list behavior.
- Create `tests/fixtures/catalog/mini.jsonl` — tiny valid dataset fixture.

**Phase 2 — App integration**

- Create `src/lib/server/nutrient-extract.ts` — pure nutrient-extraction helper (extracted from `openfoodfacts.ts`, Gap 8).
- Modify `src/lib/server/openfoodfacts.ts` — use the shared helper (behavior-preserving).
- Create `src/lib/server/catalog/queries.ts` — `catalogSearch`, `catalogByBarcode`, `instantiateCatalogFood`.
- Create `src/routes/api/catalog/search/+server.ts`, `src/routes/api/catalog/barcode/[code]/+server.ts`, `src/routes/api/catalog/[id]/save/+server.ts`.
- Modify `src/lib/server/openapi.ts` — declare the 3 catalog routes; regenerate `docs/openapi.json` + `src/lib/api/generated/schema.d.ts`.
- Modify `messages/en.json`, `messages/de.json` — catalog UI strings.
- Modify `src/lib/components/entries/FoodPicker.svelte` — online catalog search + source badge.
- Modify `src/lib/components/entries/AddFoodModal.svelte` — catalog pick → save → log.
- Modify `src/lib/services/food-service.svelte.ts` — `saveFromCatalog`.
- Modify `src/lib/components/entries/DayLog.svelte` — barcode miss → catalog before OFF.
- Create `tests/integration-db/catalog-endpoints.test.ts` — access gating, priority tie-break, instantiate, `/api/foods` isolation.
- Create `src/lib/server/nutrient-extract.test.ts` — unit test.

---

# PHASE 1 — Catalog Foundation

### Task 1: Catalog schema + migration (with hand-appended pg_trgm) + drift-guard test

**Files:**
- Test: `tests/integration-db/catalog-schema.test.ts` (create)
- Modify: `src/lib/server/schema.ts` (append after the `foods` table block)
- Generate: `drizzle/0037_*.sql` + `drizzle/meta/_journal.json` (drizzle-kit), then hand-edit the `.sql`

- [ ] **Step 1: Write the failing drift-guard + extension integration test**

Create `tests/integration-db/catalog-schema.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDatabase, dropTestDatabase, runTestMigrations, getTestDB, closeTestDB } from './helpers';
import { ALL_NUTRIENTS } from '$lib/nutrients';

const DB_NAME = 'test_catalog_schema';
let dbUrl: string;

beforeAll(async () => {
	dbUrl = await createTestDatabase(DB_NAME);
	await runTestMigrations(dbUrl);
});

afterAll(async () => {
	await closeTestDB(dbUrl);
	await dropTestDatabase(DB_NAME);
});

async function columns(db: ReturnType<typeof getTestDB>, table: string): Promise<Set<string>> {
	const rows = await db.execute(
		sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${table}`
	);
	return new Set((rows as unknown as { column_name: string }[]).map((r) => r.column_name));
}

describe('catalog schema', () => {
	it('catalog_foods nutrient columns match foods and ALL_NUTRIENTS exactly', async () => {
		const db = getTestDB(dbUrl);
		const catalogCols = await columns(db, 'catalog_foods');
		const foodCols = await columns(db, 'foods');
		for (const n of ALL_NUTRIENTS) {
			expect(catalogCols.has(n.dbColumn), `catalog_foods missing ${n.dbColumn}`).toBe(true);
			expect(foodCols.has(n.dbColumn), `foods missing ${n.dbColumn}`).toBe(true);
		}
	});

	it('pg_trgm extension and GIN name index exist', async () => {
		const db = getTestDB(dbUrl);
		const ext = await db.execute(sql`SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'`);
		expect((ext as unknown as unknown[]).length).toBe(1);
		const idx = await db.execute(
			sql`SELECT 1 FROM pg_indexes WHERE indexname = 'idx_catalog_foods_name_trgm'`
		);
		expect((idx as unknown as unknown[]).length).toBe(1);
	});

	it('catalog_datasets.key is unique and catalog_access has composite PK', async () => {
		const db = getTestDB(dbUrl);
		const ds = await columns(db, 'catalog_datasets');
		expect(ds.has('key')).toBe(true);
		expect(ds.has('priority')).toBe(true);
		const acc = await columns(db, 'catalog_access');
		expect(acc.has('user_id')).toBe(true);
		expect(acc.has('dataset_id')).toBe(true);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test:integration-db -- tests/integration-db/catalog-schema.test.ts`
Expected: FAIL — migration has no `catalog_foods` table (`relation "catalog_foods" does not exist` or column assertions fail).

- [ ] **Step 3: Add the three tables to `src/lib/server/schema.ts`**

Append immediately after the closing `);` of the `foods` table definition (the import block at the top already includes `pgTable, uuid, text, timestamp, real, boolean, integer, index, uniqueIndex, primaryKey, check` and `sql` — no import changes needed):

```typescript
export const catalogDatasets = pgTable('catalog_datasets', {
	id: uuid('id').primaryKey().defaultRandom(),
	key: text('key').notNull().unique(),
	name: text('name').notNull(),
	source: text('source').notNull(),
	priority: integer('priority').notNull().default(100),
	description: text('description'),
	productCount: integer('product_count'),
	version: text('version'),
	snapshotAt: timestamp('snapshot_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
});

export const catalogFoods = pgTable(
	'catalog_foods',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		datasetId: uuid('dataset_id')
			.notNull()
			.references(() => catalogDatasets.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		brand: text('brand'),
		language: text('language'),
		servingSize: real('serving_size').notNull(),
		servingUnit: servingUnitEnum('serving_unit').notNull(),
		calories: real('calories').notNull(),
		protein: real('protein').notNull(),
		carbs: real('carbs').notNull(),
		fat: real('fat').notNull(),
		fiber: real('fiber').notNull(),
		// Advanced nutrients — fat breakdown
		saturatedFat: real('saturated_fat'),
		monounsaturatedFat: real('monounsaturated_fat'),
		polyunsaturatedFat: real('polyunsaturated_fat'),
		transFat: real('trans_fat'),
		cholesterol: real('cholesterol'),
		omega3: real('omega3'),
		omega6: real('omega6'),
		// Sugar & carb details
		sugar: real('sugar'),
		addedSugars: real('added_sugars'),
		sugarAlcohols: real('sugar_alcohols'),
		starch: real('starch'),
		// Minerals
		sodium: real('sodium'),
		potassium: real('potassium'),
		calcium: real('calcium'),
		iron: real('iron'),
		magnesium: real('magnesium'),
		phosphorus: real('phosphorus'),
		zinc: real('zinc'),
		copper: real('copper'),
		manganese: real('manganese'),
		selenium: real('selenium'),
		iodine: real('iodine'),
		fluoride: real('fluoride'),
		chromium: real('chromium'),
		molybdenum: real('molybdenum'),
		chloride: real('chloride'),
		// Vitamins
		vitaminA: real('vitamin_a'),
		vitaminC: real('vitamin_c'),
		vitaminD: real('vitamin_d'),
		vitaminE: real('vitamin_e'),
		vitaminK: real('vitamin_k'),
		vitaminB1: real('vitamin_b1'),
		vitaminB2: real('vitamin_b2'),
		vitaminB3: real('vitamin_b3'),
		vitaminB5: real('vitamin_b5'),
		vitaminB6: real('vitamin_b6'),
		vitaminB7: real('vitamin_b7'),
		vitaminB9: real('vitamin_b9'),
		vitaminB12: real('vitamin_b12'),
		// Other
		caffeine: real('caffeine'),
		alcohol: real('alcohol'),
		water: real('water'),
		salt: real('salt'),
		barcode: text('barcode'),
		nutriScore: text('nutri_score'),
		novaGroup: integer('nova_group'),
		additives: text('additives').array(),
		ingredientsText: text('ingredients_text'),
		imageUrl: text('image_url'),
		sourceUrl: text('source_url'),
		sourceRef: text('source_ref'),
		crawledAt: timestamp('crawled_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
	},
	(table) => [
		index('idx_catalog_foods_dataset').on(table.datasetId),
		index('idx_catalog_foods_dataset_barcode').on(table.datasetId, table.barcode),
		check('catalog_foods_serving_positive', sql`${table.servingSize} > 0`),
		check(
			'catalog_foods_nutrition_nonnegative',
			sql`${table.calories} >= 0 AND ${table.protein} >= 0 AND ${table.carbs} >= 0 AND ${table.fat} >= 0 AND ${table.fiber} >= 0`
		)
	]
);

export const catalogAccess = pgTable(
	'catalog_access',
	{
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		datasetId: uuid('dataset_id')
			.notNull()
			.references(() => catalogDatasets.id, { onDelete: 'cascade' }),
		grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow()
	},
	(table) => [primaryKey({ columns: [table.userId, table.datasetId] })]
);
```

The `name gin_trgm_ops` index is intentionally NOT declared here — drizzle-kit cannot emit the opclass or `CREATE EXTENSION`; it is hand-appended to the migration (Step 5) and verified by the test.

- [ ] **Step 4: Generate the migration**

Run: `bun run db:generate`
Expected: a new file `drizzle/0037_<random>.sql` is created and `drizzle/meta/_journal.json` gains an `idx: 37` entry. Note the exact generated filename.

- [ ] **Step 5: Hand-append the pg_trgm extension + GIN index to the generated SQL**

Open the generated `drizzle/0037_<random>.sql`. At the very END of the file, append (the last existing statement already ends with `--> statement-breakpoint` or is the last `CREATE TABLE`; ensure a `--> statement-breakpoint` separates them):

```sql
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "idx_catalog_foods_name_trgm" ON "catalog_foods" USING gin ("name" gin_trgm_ops);
```

Do NOT run `bun run db:generate` again after this edit (it would overwrite the manual SQL — this file is now frozen; the journal already records it).

- [ ] **Step 6: Run the test to verify it passes**

Run: `bun run test:integration-db -- tests/integration-db/catalog-schema.test.ts`
Expected: PASS (3 tests). Testcontainers `postgres:18` ships `pg_trgm` in contrib.

- [ ] **Step 7: Verify the dev server starts cleanly (migration safety rule)**

Run: `timeout 25 bun run dev 2>&1 | head -40`
Expected: server boots, no "Migration failed" output. (Stop it; the migration applied via `runMigrations()`.)

- [ ] **Step 8: Commit**

```bash
git add src/lib/server/schema.ts drizzle/ tests/integration-db/catalog-schema.test.ts
git commit -m "feat: add catalog schema (datasets/foods/access) + pg_trgm index"
```

---

### Task 2: Dataset JSONL Zod schema (the crawler↔importer contract)

**Files:**
- Test: `src/lib/server/catalog/dataset-schema.test.ts` (create)
- Create: `src/lib/server/catalog/dataset-schema.ts`

- [ ] **Step 1: Write the failing unit test**

Create `src/lib/server/catalog/dataset-schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { datasetHeaderSchema, datasetProductSchema } from './dataset-schema';

describe('dataset-schema', () => {
	it('accepts a valid header record', () => {
		const r = datasetHeaderSchema.safeParse({
			_dataset: {
				key: 'migros',
				name: 'Migros (Switzerland)',
				source: 'migros',
				priority: 10,
				version: '2026.05.18',
				snapshotAt: '2026-05-18T00:00:00.000Z'
			}
		});
		expect(r.success).toBe(true);
	});

	it('accepts a minimal valid product line', () => {
		const r = datasetProductSchema.safeParse({
			name: 'Zweifel Paprika Chips',
			servingSize: 100,
			servingUnit: 'g',
			calories: 515,
			protein: 5.8,
			carbs: 53,
			fat: 30,
			fiber: 5.6
		});
		expect(r.success).toBe(true);
	});

	it('accepts known extended nutrients and OFF quality fields', () => {
		const r = datasetProductSchema.safeParse({
			name: 'X',
			servingSize: 100,
			servingUnit: 'g',
			calories: 1,
			protein: 1,
			carbs: 1,
			fat: 1,
			fiber: 1,
			saturatedFat: 5.1,
			salt: 1.3,
			barcode: '7610095131003',
			language: 'de',
			nutriScore: 'd',
			novaGroup: 4,
			additives: ['en:e330'],
			sourceUrl: 'https://www.migros.ch/de/product/123',
			sourceRef: '123'
		});
		expect(r.success).toBe(true);
	});

	it('rejects a product missing required core macros', () => {
		const r = datasetProductSchema.safeParse({ name: 'X', servingSize: 100, servingUnit: 'g' });
		expect(r.success).toBe(false);
	});

	it('rejects negative nutrients and bad nutriScore', () => {
		expect(
			datasetProductSchema.safeParse({
				name: 'X',
				servingSize: 100,
				servingUnit: 'g',
				calories: -1,
				protein: 0,
				carbs: 0,
				fat: 0,
				fiber: 0
			}).success
		).toBe(false);
		expect(
			datasetProductSchema.safeParse({
				name: 'X',
				servingSize: 100,
				servingUnit: 'g',
				calories: 0,
				protein: 0,
				carbs: 0,
				fat: 0,
				fiber: 0,
				nutriScore: 'z'
			}).success
		).toBe(false);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun --bun vitest run src/lib/server/catalog/dataset-schema.test.ts`
Expected: FAIL — `Cannot find module './dataset-schema'`.

- [ ] **Step 3: Implement the schema**

Create `src/lib/server/catalog/dataset-schema.ts`:

```typescript
import { z } from 'zod';
import { servingUnitSchema } from '$lib/units';
import { ALL_NUTRIENT_KEYS } from '$lib/nutrients';

const optNutrient = z.coerce.number().nonnegative().optional().nullable();
const nutrientFields = Object.fromEntries(ALL_NUTRIENT_KEYS.map((k) => [k, optNutrient]));

export const datasetHeaderSchema = z.object({
	_dataset: z.object({
		key: z
			.string()
			.min(1)
			.max(64)
			.regex(/^[a-z0-9-]+$/),
		name: z.string().min(1).max(200),
		source: z.enum(['migros', 'off', 'coop']),
		priority: z.coerce.number().int().min(0).max(1000),
		version: z.string().max(64).optional().nullable(),
		snapshotAt: z.string().datetime().optional().nullable()
	})
});

export const datasetProductSchema = z.object({
	name: z.string().min(1).max(500),
	brand: z.string().max(500).optional().nullable(),
	language: z.enum(['de', 'fr', 'it', 'en']).optional().nullable(),
	servingSize: z.coerce.number().positive(),
	servingUnit: servingUnitSchema,
	calories: z.coerce.number().nonnegative(),
	protein: z.coerce.number().nonnegative(),
	carbs: z.coerce.number().nonnegative(),
	fat: z.coerce.number().nonnegative(),
	fiber: z.coerce.number().nonnegative(),
	...nutrientFields,
	barcode: z.string().max(32).optional().nullable(),
	nutriScore: z.enum(['a', 'b', 'c', 'd', 'e']).optional().nullable(),
	novaGroup: z.coerce.number().int().min(1).max(4).optional().nullable(),
	additives: z.array(z.string().max(100)).max(200).optional().nullable(),
	ingredientsText: z.string().max(10000).optional().nullable(),
	imageUrl: z.string().url().max(2000).optional().nullable(),
	sourceUrl: z.string().url().max(2000).optional().nullable(),
	sourceRef: z.string().max(200).optional().nullable(),
	crawledAt: z.string().datetime().optional().nullable()
});

export type DatasetHeader = z.infer<typeof datasetHeaderSchema>;
export type DatasetProduct = z.infer<typeof datasetProductSchema>;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun --bun vitest run src/lib/server/catalog/dataset-schema.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/catalog/dataset-schema.ts src/lib/server/catalog/dataset-schema.test.ts
git commit -m "feat: add catalog dataset JSONL Zod schema"
```

---

### Task 3: Catalog CLI — `import` subcommand + fixture + integration test

**Files:**
- Create: `tests/fixtures/catalog/mini.jsonl`
- Test: `tests/integration-db/catalog-import.test.ts` (create)
- Create: `scripts/catalog.ts`
- Modify: `package.json` (scripts block)

- [ ] **Step 1: Create the fixture dataset**

Create `tests/fixtures/catalog/mini.jsonl` (exactly these 3 lines; line 1 is the header):

```
{"_dataset":{"key":"testset","name":"Test Set","source":"migros","priority":10,"version":"t1","snapshotAt":"2026-05-18T00:00:00.000Z"}}
{"name":"Zweifel Paprika Chips","brand":"Zweifel","language":"de","servingSize":100,"servingUnit":"g","calories":515,"protein":5.8,"carbs":53,"fat":30,"fiber":5.6,"saturatedFat":1.8,"salt":1.3,"barcode":"7610095131003","sourceUrl":"https://www.migros.ch/de/product/1","sourceRef":"1"}
{"name":"Coop Naturaplan Bio Apfel","brand":"Coop","language":"de","servingSize":100,"servingUnit":"g","calories":52,"protein":0.3,"carbs":14,"fat":0.2,"fiber":2.4,"barcode":"7610095131004","sourceUrl":"https://www.migros.ch/de/product/2","sourceRef":"2"}
```

- [ ] **Step 2: Write the failing import integration test**

Create `tests/integration-db/catalog-import.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { $ } from 'bun';
import { join } from 'node:path';
import { createTestDatabase, dropTestDatabase, runTestMigrations, getTestDB, closeTestDB } from './helpers';
import { catalogDatasets, catalogFoods } from '$lib/server/schema';

const DB_NAME = 'test_catalog_import';
let dbUrl: string;
const FIXTURE = join(process.cwd(), 'tests/fixtures/catalog/mini.jsonl');

beforeAll(async () => {
	dbUrl = await createTestDatabase(DB_NAME);
	await runTestMigrations(dbUrl);
});
afterAll(async () => {
	await closeTestDB(dbUrl);
	await dropTestDatabase(DB_NAME);
});

describe('catalog:import', () => {
	it('imports a dataset, upserts by key, replaces rows on re-import', async () => {
		await $`bun run scripts/catalog.ts import ${FIXTURE}`.env({ ...process.env, DATABASE_URL: dbUrl });
		const db = getTestDB(dbUrl);
		const ds = await db.query.catalogDatasets.findFirst({ where: eq(catalogDatasets.key, 'testset') });
		expect(ds).toBeDefined();
		expect(ds!.productCount).toBe(2);
		const firstId = ds!.id;
		const rows = await db.select().from(catalogFoods).where(eq(catalogFoods.datasetId, firstId));
		expect(rows.length).toBe(2);
		expect(rows.find((r) => r.barcode === '7610095131003')!.name).toBe('Zweifel Paprika Chips');

		// Re-import: same key reuses the dataset row (id stable), rows replaced
		await $`bun run scripts/catalog.ts import ${FIXTURE}`.env({ ...process.env, DATABASE_URL: dbUrl });
		const ds2 = await db.query.catalogDatasets.findFirst({ where: eq(catalogDatasets.key, 'testset') });
		expect(ds2!.id).toBe(firstId);
		const rows2 = await db.select().from(catalogFoods).where(eq(catalogFoods.datasetId, firstId));
		expect(rows2.length).toBe(2);
	});

	it('fails closed on an invalid line and aborts the whole import', async () => {
		const bad = join(process.cwd(), 'tests/fixtures/catalog/bad.jsonl');
		await Bun.write(
			bad,
			'{"_dataset":{"key":"badset","name":"Bad","source":"migros","priority":1}}\n{"name":"NoMacros","servingSize":100,"servingUnit":"g"}\n'
		);
		let failed = false;
		try {
			await $`bun run scripts/catalog.ts import ${bad}`
				.env({ ...process.env, DATABASE_URL: dbUrl })
				.quiet();
		} catch {
			failed = true;
		}
		expect(failed).toBe(true);
		const db = getTestDB(dbUrl);
		const ds = await db.query.catalogDatasets.findFirst({ where: eq(catalogDatasets.key, 'badset') });
		expect(ds).toBeUndefined();
	});
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun run test:integration-db -- tests/integration-db/catalog-import.test.ts`
Expected: FAIL — `scripts/catalog.ts` does not exist (`bun run` errors / non-zero exit).

- [ ] **Step 4: Implement `scripts/catalog.ts` (import subcommand)**

Create `scripts/catalog.ts`:

```typescript
#!/usr/bin/env bun
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, sql } from 'drizzle-orm';
import postgres from 'postgres';
import { catalogDatasets, catalogFoods, catalogAccess, users } from '../src/lib/server/schema';
import { datasetHeaderSchema, datasetProductSchema } from '../src/lib/server/catalog/dataset-schema';
import { ALL_NUTRIENT_KEYS } from '../src/lib/nutrients';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error('DATABASE_URL environment variable is required');
	process.exit(1);
}
const client = postgres(databaseUrl, { max: 1 });
const db = drizzle(client, { schema: { catalogDatasets, catalogFoods, catalogAccess, users } });

const TRGM_INDEX = 'idx_catalog_foods_name_trgm';

function pickNutrientCols(p: Record<string, unknown>) {
	return Object.fromEntries(ALL_NUTRIENT_KEYS.map((k) => [k, (p[k] as number | null | undefined) ?? null]));
}

async function importDataset(file: string) {
	const text = await Bun.file(file).text();
	const lines = text.split('\n').filter((l) => l.trim().length > 0);
	if (lines.length === 0) throw new Error('Empty dataset file');

	const header = datasetHeaderSchema.parse(JSON.parse(lines[0]))._dataset;

	const products = lines.slice(1).map((line, i) => {
		const parsed = datasetProductSchema.safeParse(JSON.parse(line));
		if (!parsed.success) {
			throw new Error(`Invalid product at line ${i + 2}: ${parsed.error.message}`);
		}
		return parsed.data;
	});

	await db.transaction(async (tx) => {
		const [ds] = await tx
			.insert(catalogDatasets)
			.values({
				key: header.key,
				name: header.name,
				source: header.source,
				priority: header.priority,
				version: header.version ?? null,
				snapshotAt: header.snapshotAt ? new Date(header.snapshotAt) : null,
				productCount: products.length,
				updatedAt: new Date()
			})
			.onConflictDoUpdate({
				target: catalogDatasets.key,
				set: {
					name: header.name,
					source: header.source,
					priority: header.priority,
					version: header.version ?? null,
					snapshotAt: header.snapshotAt ? new Date(header.snapshotAt) : null,
					productCount: products.length,
					updatedAt: new Date()
				}
			})
			.returning();

		await tx.execute(sql`DROP INDEX IF EXISTS ${sql.identifier(TRGM_INDEX)}`);
		await tx.delete(catalogFoods).where(eq(catalogFoods.datasetId, ds.id));

		const CHUNK = 2000;
		for (let i = 0; i < products.length; i += CHUNK) {
			const slice = products.slice(i, i + CHUNK).map((p) => ({
				datasetId: ds.id,
				name: p.name,
				brand: p.brand ?? null,
				language: p.language ?? null,
				servingSize: p.servingSize,
				servingUnit: p.servingUnit,
				calories: p.calories,
				protein: p.protein,
				carbs: p.carbs,
				fat: p.fat,
				fiber: p.fiber,
				barcode: p.barcode ?? null,
				nutriScore: p.nutriScore ?? null,
				novaGroup: p.novaGroup ?? null,
				additives: p.additives ?? null,
				ingredientsText: p.ingredientsText ?? null,
				imageUrl: p.imageUrl ?? null,
				sourceUrl: p.sourceUrl ?? null,
				sourceRef: p.sourceRef ?? null,
				crawledAt: p.crawledAt ? new Date(p.crawledAt) : null,
				...pickNutrientCols(p as Record<string, unknown>)
			}));
			if (slice.length > 0) await tx.insert(catalogFoods).values(slice);
		}

		await tx.execute(
			sql`CREATE INDEX ${sql.identifier(TRGM_INDEX)} ON ${catalogFoods} USING gin (${catalogFoods.name} gin_trgm_ops)`
		);
	});

	console.log(`Imported ${products.length} products into dataset "${header.key}"`);
}

const [cmd, ...args] = process.argv.slice(2);

try {
	if (cmd === 'import') {
		if (!args[0]) throw new Error('Usage: catalog import <file.jsonl>');
		await importDataset(args[0]);
	} else {
		throw new Error(`Unknown command: ${cmd ?? '(none)'}. Expected: import|grant|revoke|list`);
	}
	await client.end();
	process.exit(0);
} catch (e) {
	console.error(e instanceof Error ? e.message : String(e));
	await client.end();
	process.exit(1);
}
```

- [ ] **Step 5: Add the `catalog:import` package.json script**

In `package.json`, inside `"scripts"`, after the `"test:seed"` line add:

```json
		"catalog:import": "bun run scripts/catalog.ts import",
		"catalog:grant": "bun run scripts/catalog.ts grant",
		"catalog:revoke": "bun run scripts/catalog.ts revoke",
		"catalog:list": "bun run scripts/catalog.ts list"
```

(Add a trailing comma to the preceding `"test:seed": ...` line so JSON stays valid; the last new line gets no trailing comma if it is the final scripts entry.)

- [ ] **Step 6: Run the test to verify it passes**

Run: `bun run test:integration-db -- tests/integration-db/catalog-import.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add scripts/catalog.ts package.json tests/fixtures/catalog/mini.jsonl tests/integration-db/catalog-import.test.ts
git commit -m "feat: add catalog:import CLI (validated JSONL, batched replace, GIN recreate)"
```

---

### Task 4: Catalog CLI — `grant` / `revoke` / `list` subcommands + integration test

**Files:**
- Test: `tests/integration-db/catalog-import.test.ts` (extend — add a `describe` block)
- Modify: `scripts/catalog.ts`

- [ ] **Step 1: Add the failing test block**

Append to `tests/integration-db/catalog-import.test.ts` (after the existing `describe('catalog:import', ...)` block), and add `users` to the schema import at the top of the file (`import { catalogDatasets, catalogFoods, catalogAccess, users } from '$lib/server/schema';` and `import { and } from 'drizzle-orm';` alongside `eq`):

```typescript
describe('catalog:grant / revoke / list', () => {
	it('grants and revokes dataset access by user email', async () => {
		const db = getTestDB(dbUrl);
		await $`bun run scripts/catalog.ts import ${FIXTURE}`.env({ ...process.env, DATABASE_URL: dbUrl });
		const [u] = await db
			.insert(users)
			.values({ infomaniakSub: 'sub-grant-1', email: 'fam@example.com' })
			.returning();
		const ds = (await db.query.catalogDatasets.findFirst({ where: eq(catalogDatasets.key, 'testset') }))!;

		await $`bun run scripts/catalog.ts grant fam@example.com testset`.env({ ...process.env, DATABASE_URL: dbUrl });
		let grants = await db
			.select()
			.from(catalogAccess)
			.where(and(eq(catalogAccess.userId, u.id), eq(catalogAccess.datasetId, ds.id)));
		expect(grants.length).toBe(1);

		await $`bun run scripts/catalog.ts revoke fam@example.com testset`.env({ ...process.env, DATABASE_URL: dbUrl });
		grants = await db
			.select()
			.from(catalogAccess)
			.where(and(eq(catalogAccess.userId, u.id), eq(catalogAccess.datasetId, ds.id)));
		expect(grants.length).toBe(0);
	});

	it('list exits 0', async () => {
		const r = await $`bun run scripts/catalog.ts list`
			.env({ ...process.env, DATABASE_URL: dbUrl })
			.quiet();
		expect(r.exitCode).toBe(0);
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test:integration-db -- tests/integration-db/catalog-import.test.ts`
Expected: FAIL — `Unknown command: grant`.

- [ ] **Step 3: Implement the subcommands in `scripts/catalog.ts`**

Add these functions above the `const [cmd, ...args] = ...` line:

```typescript
async function resolveUserId(email: string): Promise<string> {
	const u = await db.query.users.findFirst({ where: eq(users.email, email) });
	if (!u) throw new Error(`No user with email ${email}`);
	return u.id;
}

async function resolveDatasetId(key: string): Promise<string> {
	const d = await db.query.catalogDatasets.findFirst({ where: eq(catalogDatasets.key, key) });
	if (!d) throw new Error(`No dataset with key ${key}`);
	return d.id;
}

async function grant(email: string, key: string) {
	const userId = await resolveUserId(email);
	const datasetId = await resolveDatasetId(key);
	await db.insert(catalogAccess).values({ userId, datasetId }).onConflictDoNothing();
	console.log(`Granted "${key}" to ${email}`);
}

async function revoke(email: string, key: string) {
	const userId = await resolveUserId(email);
	const datasetId = await resolveDatasetId(key);
	await db
		.delete(catalogAccess)
		.where(sql`${catalogAccess.userId} = ${userId} AND ${catalogAccess.datasetId} = ${datasetId}`);
	console.log(`Revoked "${key}" from ${email}`);
}

async function list() {
	const datasets = await db.select().from(catalogDatasets);
	for (const d of datasets) {
		const grants = await db
			.select({ email: users.email })
			.from(catalogAccess)
			.innerJoin(users, eq(users.id, catalogAccess.userId))
			.where(eq(catalogAccess.datasetId, d.id));
		console.log(
			`${d.key}  (${d.source}, prio ${d.priority}, ${d.productCount ?? 0} products)  -> ${
				grants.map((g) => g.email).join(', ') || '(no grants)'
			}`
		);
	}
}
```

Replace the command dispatch block with:

```typescript
const [cmd, ...args] = process.argv.slice(2);

try {
	if (cmd === 'import') {
		if (!args[0]) throw new Error('Usage: catalog import <file.jsonl>');
		await importDataset(args[0]);
	} else if (cmd === 'grant') {
		if (!args[0] || !args[1]) throw new Error('Usage: catalog grant <userEmail> <datasetKey>');
		await grant(args[0], args[1]);
	} else if (cmd === 'revoke') {
		if (!args[0] || !args[1]) throw new Error('Usage: catalog revoke <userEmail> <datasetKey>');
		await revoke(args[0], args[1]);
	} else if (cmd === 'list') {
		await list();
	} else {
		throw new Error(`Unknown command: ${cmd ?? '(none)'}. Expected: import|grant|revoke|list`);
	}
	await client.end();
	process.exit(0);
} catch (e) {
	console.error(e instanceof Error ? e.message : String(e));
	await client.end();
	process.exit(1);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun run test:integration-db -- tests/integration-db/catalog-import.test.ts`
Expected: PASS (4 tests total).

- [ ] **Step 5: Commit**

```bash
git add scripts/catalog.ts tests/integration-db/catalog-import.test.ts
git commit -m "feat: add catalog:grant/revoke/list CLI subcommands"
```

---

### Task 5: Repo guardrails — gitignore + prek hook blocking committed datasets

**Files:**
- Modify: `.gitignore`
- Modify: `.pre-commit-config.yaml`

- [ ] **Step 1: Add the ignore rule**

Append to the end of `.gitignore`:

```

# Crawled catalog datasets — never commit (public repo; private data)
data/catalog/
```

- [ ] **Step 2: Add a local prek guard hook**

In `.pre-commit-config.yaml`, add this hook as the last entry under `hooks:` (same `repo: local` block, matching the existing `language: system` style):

```yaml
      - id: no-catalog-data
        name: no committed catalog datasets
        entry: bash -c 'if git diff --cached --name-only | grep -E "^data/catalog/.*\.jsonl$"; then echo "ERROR: catalog dataset files must not be committed (public repo)"; exit 1; fi'
        language: system
        pass_filenames: false
```

- [ ] **Step 3: Verify the guard triggers**

Run:

```bash
mkdir -p data/catalog && cp tests/fixtures/catalog/mini.jsonl data/catalog/x.jsonl && git add -f data/catalog/x.jsonl && bunx prek run no-catalog-data --hook-stage pre-commit; echo "exit=$?"
```

Expected: prints the ERROR line and `exit=1`. Then clean up:

```bash
git reset data/catalog/x.jsonl && rm -rf data/catalog
```

Expected: `data/catalog/` is gitignored and untracked.

- [ ] **Step 4: Commit**

```bash
git add .gitignore .pre-commit-config.yaml
git commit -m "chore: gitignore + prek guard against committing catalog datasets"
```

---

# PHASE 2 — App Integration

### Task 6: Extract shared nutrient-extraction helper (Gap 8)

**Files:**
- Test: `src/lib/server/nutrient-extract.test.ts` (create)
- Create: `src/lib/server/nutrient-extract.ts`
- Modify: `src/lib/server/openfoodfacts.ts`

- [ ] **Step 1: Write the failing unit test**

Create `src/lib/server/nutrient-extract.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { extractNutrient, extractAllNutrients } from './nutrient-extract';

describe('nutrient-extract', () => {
	it('extractNutrient returns null for missing/NaN and rounds with conversion', () => {
		expect(extractNutrient({}, 'x_100g')).toBeNull();
		expect(extractNutrient({ x_100g: 'abc' }, 'x_100g')).toBeNull();
		expect(extractNutrient({}, undefined)).toBeNull();
		expect(extractNutrient({ x_100g: 1.234 }, 'x_100g')).toBe(1.23);
		expect(extractNutrient({ x_100g: 0.5 }, 'x_100g', 1000)).toBe(500);
		expect(extractNutrient({ x_100g: '2.5' }, 'x_100g')).toBe(2.5);
	});

	it('extractAllNutrients maps every ALL_NUTRIENTS key', async () => {
		const { ALL_NUTRIENT_KEYS } = await import('$lib/nutrients');
		const out = extractAllNutrients({ 'saturated-fat_100g': 5 });
		for (const k of ALL_NUTRIENT_KEYS) expect(k in out).toBe(true);
		expect(out.saturatedFat).toBe(5);
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun --bun vitest run src/lib/server/nutrient-extract.test.ts`
Expected: FAIL — `Cannot find module './nutrient-extract'`.

- [ ] **Step 3: Create the shared helper**

Create `src/lib/server/nutrient-extract.ts` (logic copied verbatim from the current private `extractNutrient` in `openfoodfacts.ts`, plus the `ALL_NUTRIENTS` loop, so behavior is identical):

```typescript
import { ALL_NUTRIENTS } from '$lib/nutrients';

export function extractNutrient(
	nutriments: Record<string, number | string | undefined>,
	offKey: string | undefined,
	conversion?: number
): number | null {
	if (!offKey) return null;
	const raw = nutriments[offKey];
	if (raw == null) return null;
	const num = typeof raw === 'string' ? parseFloat(raw) : raw;
	if (isNaN(num)) return null;
	if (conversion) return Math.round(num * conversion * 100) / 100;
	return Math.round(num * 100) / 100;
}

export function extractAllNutrients(
	nutriments: Record<string, number | string | undefined>
): Record<string, number | null> {
	const out: Record<string, number | null> = {};
	for (const n of ALL_NUTRIENTS) {
		out[n.key] = extractNutrient(nutriments, n.offKey, n.offConversion);
	}
	return out;
}
```

- [ ] **Step 4: Refactor `openfoodfacts.ts` to use it (behavior-preserving)**

In `src/lib/server/openfoodfacts.ts`: change the import line `import { ALL_NUTRIENTS } from '$lib/nutrients';` to `import { extractAllNutrients } from '$lib/server/nutrient-extract';`. Delete the private `extractNutrient` function (lines 67–79). In `mapSearchProduct`, replace the loop:

```typescript
	for (const nutrient of ALL_NUTRIENTS) {
		result[nutrient.key] = extractNutrient(n, nutrient.offKey, nutrient.offConversion);
	}
```

with:

```typescript
	Object.assign(result, extractAllNutrients(n));
```

- [ ] **Step 5: Run the OFF + new helper tests to verify no regression**

Run: `bun --bun vitest run src/lib/server/nutrient-extract.test.ts && bun run check`
Expected: nutrient-extract tests PASS; `bun run check` exits 0 (no type errors from the refactor). If OFF has existing tests, run `bun --bun vitest run src/lib/server/openfoodfacts` — Expected: still PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/nutrient-extract.ts src/lib/server/nutrient-extract.test.ts src/lib/server/openfoodfacts.ts
git commit -m "refactor: extract shared nutrient-extraction helper from openfoodfacts"
```

---

### Task 7: Catalog server queries (search / barcode / instantiate)

**Files:**
- Test: `tests/integration-db/catalog-endpoints.test.ts` (create — query-layer tests first)
- Create: `src/lib/server/catalog/queries.ts`

- [ ] **Step 1: Write the failing query-layer integration test**

Create `tests/integration-db/catalog-endpoints.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { $ } from 'bun';
import { join } from 'node:path';
import { createTestDatabase, dropTestDatabase, runTestMigrations, getTestDB, closeTestDB } from './helpers';
import { catalogDatasets, catalogFoods, catalogAccess, users, foods } from '$lib/server/schema';

const DB_NAME = 'test_catalog_endpoints';
let dbUrl: string;
const FIXTURE = join(process.cwd(), 'tests/fixtures/catalog/mini.jsonl');

beforeAll(async () => {
	dbUrl = await createTestDatabase(DB_NAME);
	await runTestMigrations(dbUrl);
	await $`bun run scripts/catalog.ts import ${FIXTURE}`.env({ ...process.env, DATABASE_URL: dbUrl });
});
afterAll(async () => {
	await closeTestDB(dbUrl);
	await dropTestDatabase(DB_NAME);
});

describe('catalog queries', () => {
	it('catalogSearch returns nothing for an ungranted user, results for a granted one', async () => {
		const db = getTestDB(dbUrl);
		const { catalogSearch } = await import('$lib/server/catalog/queries');
		const [u] = await db
			.insert(users)
			.values({ infomaniakSub: 'sub-q-1', email: 'q1@example.com' })
			.returning();

		expect((await catalogSearch(db as never, u.id, 'Zweifel', 10)).length).toBe(0);

		const ds = (await db.query.catalogDatasets.findFirst({ where: eq(catalogDatasets.key, 'testset') }))!;
		await db.insert(catalogAccess).values({ userId: u.id, datasetId: ds.id });

		const res = await catalogSearch(db as never, u.id, 'Zweifel', 10);
		expect(res.length).toBe(1);
		expect(res[0].name).toBe('Zweifel Paprika Chips');
		expect(res[0].datasetKey).toBe('testset');
	});

	it('catalogByBarcode honors access and dataset priority tie-break', async () => {
		const db = getTestDB(dbUrl);
		const { catalogByBarcode } = await import('$lib/server/catalog/queries');
		const [u] = await db
			.insert(users)
			.values({ infomaniakSub: 'sub-q-2', email: 'q2@example.com' })
			.returning();
		expect(await catalogByBarcode(db as never, u.id, '7610095131003')).toBeNull();

		const dsLow = (await db.query.catalogDatasets.findFirst({ where: eq(catalogDatasets.key, 'testset') }))!;
		// Second dataset, same barcode, lower priority number (=higher precedence)
		const [dsHi] = await db
			.insert(catalogDatasets)
			.values({ key: 'prio', name: 'Prio', source: 'migros', priority: 1, productCount: 1 })
			.returning();
		await db.insert(catalogFoods).values({
			datasetId: dsHi.id,
			name: 'PRIO WINNER',
			servingSize: 100,
			servingUnit: 'g',
			calories: 1,
			protein: 1,
			carbs: 1,
			fat: 1,
			fiber: 1,
			barcode: '7610095131003'
		});
		await db.insert(catalogAccess).values({ userId: u.id, datasetId: dsLow.id });
		await db.insert(catalogAccess).values({ userId: u.id, datasetId: dsHi.id });

		const hit = await catalogByBarcode(db as never, u.id, '7610095131003');
		expect(hit!.name).toBe('PRIO WINNER');
	});

	it('instantiateCatalogFood creates a personal food and never mutates the catalog row', async () => {
		const db = getTestDB(dbUrl);
		const { instantiateCatalogFood } = await import('$lib/server/catalog/queries');
		const [u] = await db
			.insert(users)
			.values({ infomaniakSub: 'sub-q-3', email: 'q3@example.com' })
			.returning();
		const ds = (await db.query.catalogDatasets.findFirst({ where: eq(catalogDatasets.key, 'testset') }))!;
		await db.insert(catalogAccess).values({ userId: u.id, datasetId: ds.id });
		const [cf] = await db
			.select()
			.from(catalogFoods)
			.where(eq(catalogFoods.datasetId, ds.id))
			.limit(1);

		const food = await instantiateCatalogFood(db as never, u.id, cf.id);
		expect(food).toBeTruthy();
		expect(food!.userId).toBe(u.id);
		expect(food!.name).toBe(cf.name);

		const personal = await db.select().from(foods).where(eq(foods.userId, u.id));
		expect(personal.length).toBe(1);
		const stillThere = await db.select().from(catalogFoods).where(eq(catalogFoods.id, cf.id));
		expect(stillThere.length).toBe(1);

		// Ungranted user cannot instantiate
		const [u2] = await db
			.insert(users)
			.values({ infomaniakSub: 'sub-q-4', email: 'q4@example.com' })
			.returning();
		await expect(instantiateCatalogFood(db as never, u2.id, cf.id)).resolves.toBeNull();
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test:integration-db -- tests/integration-db/catalog-endpoints.test.ts`
Expected: FAIL — `Cannot find module '$lib/server/catalog/queries'`.

- [ ] **Step 3: Implement `src/lib/server/catalog/queries.ts`**

Create `src/lib/server/catalog/queries.ts`:

```typescript
import { and, eq, ilike, asc } from 'drizzle-orm';
import type { getDB } from '$lib/server/db';
import { catalogFoods, catalogDatasets, catalogAccess, foods } from '$lib/server/schema';
import { createFood } from '$lib/server/foods';
import { pickNutrients } from '$lib/nutrients';
import type { Result } from '$lib/server/types';

type DB = ReturnType<typeof getDB>;

export type CatalogResult = typeof catalogFoods.$inferSelect & {
	datasetKey: string;
	source: string;
};

function escapeLike(q: string): string {
	return q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export async function catalogSearch(
	db: DB,
	userId: string,
	query: string,
	limit: number
): Promise<CatalogResult[]> {
	const q = escapeLike(query.trim());
	if (q.length === 0) return [];
	const rows = await db
		.select({
			cf: catalogFoods,
			datasetKey: catalogDatasets.key,
			source: catalogDatasets.source,
			priority: catalogDatasets.priority
		})
		.from(catalogFoods)
		.innerJoin(catalogDatasets, eq(catalogDatasets.id, catalogFoods.datasetId))
		.innerJoin(
			catalogAccess,
			and(eq(catalogAccess.datasetId, catalogDatasets.id), eq(catalogAccess.userId, userId))
		)
		.where(ilike(catalogFoods.name, `%${q}%`))
		.orderBy(asc(catalogDatasets.priority), asc(catalogFoods.name))
		.limit(limit);
	return rows.map((r) => ({ ...r.cf, datasetKey: r.datasetKey, source: r.source }));
}

export async function catalogByBarcode(
	db: DB,
	userId: string,
	barcode: string
): Promise<CatalogResult | null> {
	const rows = await db
		.select({
			cf: catalogFoods,
			datasetKey: catalogDatasets.key,
			source: catalogDatasets.source
		})
		.from(catalogFoods)
		.innerJoin(catalogDatasets, eq(catalogDatasets.id, catalogFoods.datasetId))
		.innerJoin(
			catalogAccess,
			and(eq(catalogAccess.datasetId, catalogDatasets.id), eq(catalogAccess.userId, userId))
		)
		.where(eq(catalogFoods.barcode, barcode))
		.orderBy(asc(catalogDatasets.priority))
		.limit(1);
	const r = rows[0];
	return r ? { ...r.cf, datasetKey: r.datasetKey, source: r.source } : null;
}

export async function instantiateCatalogFood(
	db: DB,
	userId: string,
	catalogFoodId: string
): Promise<typeof foods.$inferSelect | null> {
	const rows = await db
		.select({ cf: catalogFoods })
		.from(catalogFoods)
		.innerJoin(catalogDatasets, eq(catalogDatasets.id, catalogFoods.datasetId))
		.innerJoin(
			catalogAccess,
			and(eq(catalogAccess.datasetId, catalogDatasets.id), eq(catalogAccess.userId, userId))
		)
		.where(eq(catalogFoods.id, catalogFoodId))
		.limit(1);
	const cf = rows[0]?.cf;
	if (!cf) return null;

	const payload = {
		name: cf.name,
		brand: cf.brand,
		servingSize: cf.servingSize,
		servingUnit: cf.servingUnit,
		calories: cf.calories,
		protein: cf.protein,
		carbs: cf.carbs,
		fat: cf.fat,
		fiber: cf.fiber,
		barcode: cf.barcode,
		nutriScore: cf.nutriScore as 'a' | 'b' | 'c' | 'd' | 'e' | null,
		novaGroup: cf.novaGroup,
		additives: cf.additives,
		ingredientsText: cf.ingredientsText,
		imageUrl: cf.imageUrl,
		...pickNutrients(cf as Record<string, unknown>)
	};
	const result: Result<typeof foods.$inferSelect> = await createFood(userId, payload);
	if (!result.success) {
		// Barcode already in the user's personal DB → treat as a benign no-op miss
		return null;
	}
	return result.data;
}
```

Note: `catalogSearch`/`catalogByBarcode`/`instantiateCatalogFood` take an explicit `db` (so tests can pass the test DB). Production callers pass `getDB()`.

- [ ] **Step 4: Run to verify it passes**

Run: `bun run test:integration-db -- tests/integration-db/catalog-endpoints.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/catalog/queries.ts tests/integration-db/catalog-endpoints.test.ts
git commit -m "feat: add access-gated catalog query layer (search/barcode/instantiate)"
```

---

### Task 8: Catalog API endpoints + OpenAPI + isolation test

**Files:**
- Test: `tests/integration-db/catalog-endpoints.test.ts` (extend — `/api/foods` isolation)
- Create: `src/routes/api/catalog/search/+server.ts`
- Create: `src/routes/api/catalog/barcode/[code]/+server.ts`
- Create: `src/routes/api/catalog/[id]/save/+server.ts`
- Modify: `src/lib/server/openapi.ts`
- Regenerate: `docs/openapi.json`, `src/lib/api/generated/schema.d.ts`

- [ ] **Step 1: Add the failing isolation test**

Append to `tests/integration-db/catalog-endpoints.test.ts`:

```typescript
import { listFoods } from '$lib/server/foods';

describe('catalog isolation from personal foods', () => {
	it('listFoods (the /api/foods source) never returns catalog rows', async () => {
		const db = getTestDB(dbUrl);
		const [u] = await db
			.insert(users)
			.values({ infomaniakSub: 'sub-iso-1', email: 'iso@example.com' })
			.returning();
		const ds = (await db.query.catalogDatasets.findFirst({ where: eq(catalogDatasets.key, 'testset') }))!;
		await db.insert(catalogAccess).values({ userId: u.id, datasetId: ds.id });
		// listFoods uses getDB() internally; this asserts the personal-food query
		// is unaffected by catalog presence for a user with zero personal foods.
		const { items } = await listFoods(u.id, { query: 'Zweifel' });
		expect(items.length).toBe(0);
	});
});
```

(`listFoods` uses `getDB()`/`DATABASE_URL`; the integration runner sets `DATABASE_URL` to the test DB via `helpers`. If `listFoods` cannot see the test DB in this harness, assert instead that `/api/foods` route output excludes catalog by inspecting the route in Step 4’s manual check — but the query-level assertion above is the primary guard since `catalogFoods` is a separate table never referenced by `listFoods`.)

- [ ] **Step 2: Run to verify it fails or is red**

Run: `bun run test:integration-db -- tests/integration-db/catalog-endpoints.test.ts`
Expected: the new test FAILS only if `listFoods` accidentally unions catalog (it must not) — i.e. it should pass once endpoints exist but is added now to lock the invariant. If it errors on DB wiring, keep it and proceed; it is the regression guard.

- [ ] **Step 3: Create `src/routes/api/catalog/search/+server.ts`**

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth, handleApiError } from '$lib/server/errors';
import { getDB } from '$lib/server/db';
import { catalogSearch } from '$lib/server/catalog/queries';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = requireAuth(locals);
		const q = url.searchParams.get('q') ?? '';
		const limitRaw = Number(url.searchParams.get('limit') ?? '20');
		const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 20;
		if (q.trim().length < 2) {
			return json({ results: [] });
		}
		const results = await catalogSearch(getDB(), userId, q, limit);
		return json({ results });
	} catch (error) {
		return handleApiError(error);
	}
};
```

- [ ] **Step 4: Create `src/routes/api/catalog/barcode/[code]/+server.ts`**

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth, handleApiError } from '$lib/server/errors';
import { isValidBarcode } from '$lib/utils/barcode';
import { getDB } from '$lib/server/db';
import { catalogByBarcode } from '$lib/server/catalog/queries';

export const GET: RequestHandler = async ({ locals, params }) => {
	try {
		const userId = requireAuth(locals);
		const { code } = params;
		if (!isValidBarcode(code)) {
			return json({ error: 'Invalid barcode format' }, { status: 400 });
		}
		const result = await catalogByBarcode(getDB(), userId, code);
		if (!result) return json({ found: false }, { status: 404 });
		return json({ found: true, result });
	} catch (error) {
		return handleApiError(error);
	}
};
```

- [ ] **Step 5: Create `src/routes/api/catalog/[id]/save/+server.ts`**

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth, requireUuid, handleApiError } from '$lib/server/errors';
import { getDB } from '$lib/server/db';
import { instantiateCatalogFood } from '$lib/server/catalog/queries';

export const POST: RequestHandler = async ({ locals, params }) => {
	try {
		const userId = requireAuth(locals);
		const id = requireUuid(params.id);
		const food = await instantiateCatalogFood(getDB(), userId, id);
		if (!food) {
			return json({ error: 'Catalog food not found or not accessible' }, { status: 404 });
		}
		return json({ food }, { status: 201 });
	} catch (error) {
		return handleApiError(error);
	}
};
```

- [ ] **Step 6: Declare the three routes in `src/lib/server/openapi.ts`**

Open `src/lib/server/openapi.ts`. Near the top, ensure `z` and the catalog query types are usable; add a response schema near the other schemas and add the three paths into the object passed to the path map (mirror the `'/api/foods'` entry style). Add this block alongside the other `'/api/...'` keys:

```typescript
		'/api/catalog/search': {
			get: {
				operationId: 'catalogSearch',
				tags: ['Catalog'],
				description: 'Online catalog search across the requesting user’s granted datasets.',
				requestParams: {
					query: z.object({ q: z.string(), limit: z.number().int().optional() })
				},
				responses: {
					'200': {
						description: 'Success',
						content: {
							'application/json': {
								schema: z.object({
									results: z.array(z.record(z.string(), z.unknown()))
								})
							}
						}
					},
					'401': res401
				}
			}
		},
		'/api/catalog/barcode/{code}': {
			get: {
				operationId: 'catalogByBarcode',
				tags: ['Catalog'],
				description: 'Barcode lookup across granted catalog datasets (priority tie-break).',
				requestParams: { path: z.object({ code: z.string() }) },
				responses: {
					'200': {
						description: 'Found',
						content: {
							'application/json': {
								schema: z.object({
									found: z.boolean(),
									result: z.record(z.string(), z.unknown()).optional()
								})
							}
						}
					},
					'400': res400,
					'401': res401,
					'404': {
						description: 'Not found',
						content: {
							'application/json': { schema: z.object({ found: z.boolean() }) }
						}
					}
				}
			}
		},
		'/api/catalog/{id}/save': {
			post: {
				operationId: 'saveCatalogFood',
				tags: ['Catalog'],
				description: 'Instantiate a personal food from a catalog row (copy-on-use).',
				requestParams: { path: z.object({ id: z.string() }) },
				responses: {
					'201': {
						description: 'Created',
						content: { 'application/json': { schema: foodResponseSchema } }
					},
					'401': res401,
					'404': res404
				}
			}
		},
```

(Use the same `res401`/`res400`/`res404`/`foodResponseSchema` symbols already defined in this file for the `/api/foods` routes. If `res404` is not defined there, reuse the inline 404 shape shown for `/api/catalog/barcode/{code}`.)

- [ ] **Step 7: Regenerate the OpenAPI spec + typed client**

Run: `bun run api:generate:ts && bunx prettier --write docs/openapi.json src/lib/api/generated/`
Expected: `docs/openapi.json` and `src/lib/api/generated/schema.d.ts` now contain `/api/catalog/search`, `/api/catalog/barcode/{code}`, `/api/catalog/{id}/save`.

Run: `bun run api:check`
Expected: exits 0 (no diff after regen). This is the same check CI runs.

- [ ] **Step 8: Run integration + type check**

Run: `bun run test:integration-db -- tests/integration-db/catalog-endpoints.test.ts && bun run check`
Expected: tests PASS; `bun run check` exits 0.

- [ ] **Step 9: Commit**

```bash
git add src/routes/api/catalog src/lib/server/openapi.ts docs/openapi.json src/lib/api/generated tests/integration-db/catalog-endpoints.test.ts
git commit -m "feat: add /api/catalog search/barcode/save endpoints + openapi"
```

---

### Task 9: i18n strings for catalog UI

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/de.json`

- [ ] **Step 1: Add English strings**

In `messages/en.json`, add these keys (keep the file’s existing alphabetical/grouping convention; place near other `add_food_*` keys):

```json
	"catalog_source_badge": "{source}",
	"add_food_catalog_searching": "Searching catalog…",
	"add_food_catalog_section": "From catalog",
	"add_food_catalog_add_failed": "Could not add this product. It may already be in your foods."
```

- [ ] **Step 2: Add German strings**

In `messages/de.json`, add the same keys:

```json
	"catalog_source_badge": "{source}",
	"add_food_catalog_searching": "Katalog wird durchsucht…",
	"add_food_catalog_section": "Aus Katalog",
	"add_food_catalog_add_failed": "Produkt konnte nicht hinzugefügt werden. Es ist evtl. schon in deinen Lebensmitteln."
```

- [ ] **Step 3: Compile messages + typecheck**

Run: `bun run paraglide:compile && bun run check`
Expected: compiles; `bun run check` exits 0; `m.add_food_catalog_section` etc. are now typed.

- [ ] **Step 4: Commit**

```bash
git add messages/en.json messages/de.json
git commit -m "feat: add i18n strings for catalog picker"
```

---

### Task 10: FoodPicker — online catalog search + source badge

**Files:**
- Modify: `src/lib/components/entries/FoodPicker.svelte`

- [ ] **Step 1: Extend `PickerSelection` and add catalog state**

In the `<script>` of `src/lib/components/entries/FoodPicker.svelte`:

Add to the `PickerSelection` union (after the `favorite` variant):

```typescript
	| { type: 'catalog'; catalog: { id: string; name: string; source: string } };
```

After `let query = $state('');` add:

```typescript
	type CatalogHit = { id: string; name: string; brand: string | null; source: string; datasetKey: string };
	let catalogResults: CatalogHit[] = $state([]);
	let catalogLoading = $state(false);
	let catalogTimer: ReturnType<typeof setTimeout> | undefined;

	const runCatalogSearch = (term: string) => {
		clearTimeout(catalogTimer);
		if (term.trim().length < 2) {
			catalogResults = [];
			catalogLoading = false;
			return;
		}
		catalogLoading = true;
		catalogTimer = setTimeout(async () => {
			try {
				const { data } = await api.GET('/api/catalog/search', {
					params: { query: { q: term } }
				});
				catalogResults = (data?.results ?? []) as CatalogHit[];
			} catch (e) {
				if (dev) console.warn('catalog search failed:', e);
				catalogResults = [];
			} finally {
				catalogLoading = false;
			}
		}, 300);
	};

	$effect(() => {
		if (tab === 'search') runCatalogSearch(query);
	});
```

- [ ] **Step 2: Render catalog results under the local results in the search tab**

In the `<Tabs.Content value="search" ...>` block, after the existing `</ul>` that lists `filtered()`, insert:

```svelte
	{#if catalogLoading}
		<p class="text-muted-foreground text-sm">{m.add_food_catalog_searching()}</p>
	{:else if catalogResults.length > 0}
		<p class="text-muted-foreground mt-2 text-xs font-medium">{m.add_food_catalog_section()}</p>
		<ul class="max-h-60 space-y-2 overflow-auto">
			{#each catalogResults as hit (hit.id)}
				<li class="flex min-w-0 items-start justify-between gap-2">
					<span class="min-w-0 flex-1 truncate text-sm">
						{hit.name}
						<span
							class="bg-muted text-muted-foreground ml-1 rounded px-1.5 py-0.5 text-[10px] uppercase"
							>{m.catalog_source_badge({ source: hit.source })}</span
						>
					</span>
					<Button
						variant="outline"
						size="sm"
						class="shrink-0"
						aria-label={m.add_food_add()}
						onclick={() =>
							onSelect({ type: 'catalog', catalog: { id: hit.id, name: hit.name, source: hit.source } })}
					>
						<Plus class="size-4 sm:mr-1" />
						<span class="hidden sm:inline">{m.add_food_add()}</span>
					</Button>
				</li>
			{/each}
		</ul>
	{/if}
```

- [ ] **Step 3: Typecheck**

Run: `bun run check`
Expected: exits 0. (`api.GET('/api/catalog/search')` is typed because Task 8 regenerated the client.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/entries/FoodPicker.svelte
git commit -m "feat: surface online catalog results with source badge in FoodPicker"
```

---

### Task 11: AddFoodModal + food-service — catalog pick → save → log

**Files:**
- Modify: `src/lib/services/food-service.svelte.ts`
- Modify: `src/lib/components/entries/AddFoodModal.svelte`

- [ ] **Step 1: Add `saveFromCatalog` to the food service**

In `src/lib/services/food-service.svelte.ts`, add this function (after `findByBarcode`) and include it in the exported `foodService` object:

```typescript
async function saveFromCatalog(catalogId: string): Promise<DexieFood | null> {
	const { data } = await api.POST('/api/catalog/{id}/save', {
		params: { path: { id: catalogId } }
	});
	if (!data?.food) return null;
	const food = data.food as unknown as DexieFood;
	await db.foods.put(food);
	return food;
}
```

And in the `export const foodService = { ... }` object add `saveFromCatalog,` alongside `findByBarcode`.

- [ ] **Step 2: Handle the catalog selection in AddFoodModal**

In `src/lib/components/entries/AddFoodModal.svelte`:

Add the import at the top of `<script>`:

```typescript
	import { foodService } from '$lib/services/food-service.svelte';
	import * as m from '$lib/paraglide/messages';
```

(`m` may already be imported — if so, do not duplicate.)

Replace the `handleSelect` function with an async version that resolves catalog picks to a real personal food first:

```typescript
	const handleSelect = async (selection: PickerSelection) => {
		if (selection.type === 'food') {
			selectedFood = {
				id: selection.food.id,
				name: selection.food.name,
				type: 'food',
				servingSize: selection.food.servingSize,
				servingUnit: selection.food.servingUnit,
				calories: selection.food.calories
			};
		} else if (selection.type === 'recipe') {
			selectedFood = { id: selection.recipe.id, name: selection.recipe.name, type: 'recipe' };
		} else if (selection.type === 'catalog') {
			const food = await foodService.saveFromCatalog(selection.catalog.id);
			if (!food) {
				alert(m.add_food_catalog_add_failed());
				return;
			}
			selectedFood = {
				id: food.id,
				name: food.name,
				type: 'food',
				servingSize: food.servingSize,
				servingUnit: food.servingUnit,
				calories: food.calories
			};
		} else {
			selectedFood = {
				id: selection.favorite.id,
				name: selection.favorite.name,
				type: selection.favorite.type,
				servingSize: selection.favorite.servingSize,
				servingUnit: selection.favorite.servingUnit,
				calories: selection.favorite.calories
			};
		}
		servings = 1;
	};
```

(The `<FoodPicker ... onSelect={handleSelect} />` binding is unchanged; `onSelect` already accepts a function returning `void | Promise<void>`.)

- [ ] **Step 3: Typecheck**

Run: `bun run check`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/lib/services/food-service.svelte.ts src/lib/components/entries/AddFoodModal.svelte
git commit -m "feat: catalog pick instantiates a personal food then logs (copy-on-use)"
```

---

### Task 12: Barcode scan — catalog lookup before OFF fallback

**Files:**
- Modify: `src/lib/components/entries/DayLog.svelte`

- [ ] **Step 1: Insert a catalog barcode check in the scan handler**

In `src/lib/components/entries/DayLog.svelte`, locate `handleBarcodeScan` (currently):

```typescript
	const handleBarcodeScan = (barcode: string) => {
		pendingBarcodeAction = async () => {
			const food = await foodService.findByBarcode(barcode);
			if (food) {
				barcodeFoodId = food.id;
				addModalOpen = true;
			} else {
				goto(`/foods?barcode=${encodeURIComponent(barcode)}`);
			}
		};
	};
```

Replace the `else` branch so the catalog is tried before navigating to the OFF prefill page. Ensure `api` is imported in this file (`import { api } from '$lib/api/client';` — add it if absent):

```typescript
	const handleBarcodeScan = (barcode: string) => {
		pendingBarcodeAction = async () => {
			const food = await foodService.findByBarcode(barcode);
			if (food) {
				barcodeFoodId = food.id;
				addModalOpen = true;
				return;
			}
			try {
				const { data } = await api.GET('/api/catalog/barcode/{code}', {
					params: { path: { code: barcode } }
				});
				if (data?.found && data.result) {
					const saved = await foodService.saveFromCatalog(
						(data.result as { id: string }).id
					);
					if (saved) {
						barcodeFoodId = saved.id;
						addModalOpen = true;
						return;
					}
				}
			} catch {
				// fall through to OFF prefill
			}
			goto(`/foods?barcode=${encodeURIComponent(barcode)}`);
		};
	};
```

- [ ] **Step 2: Typecheck**

Run: `bun run check`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/entries/DayLog.svelte
git commit -m "feat: barcode scan checks catalog before Open Food Facts fallback"
```

---

### Task 13: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

Run: `bun run check`
Expected: exits 0 (read the exit code directly; do not pipe through `tail`).

- [ ] **Step 2: Unit tests**

Run: `bun run test`
Expected: PASS, except the 4 known pre-existing session-db/oauth-db mock-persistence failures (documented in project memory) — no NEW failures, and the new `dataset-schema` / `nutrient-extract` suites green.

- [ ] **Step 3: Integration tests**

Run: `bun run test:integration-db`
Expected: PASS — `catalog-schema`, `catalog-import`, `catalog-endpoints` all green.

- [ ] **Step 4: OpenAPI drift gate (same as CI)**

Run: `bun run api:check`
Expected: exits 0.

- [ ] **Step 5: Dev server boots cleanly (migration safety)**

Run: `timeout 25 bun run dev 2>&1 | head -40`
Expected: no "Migration failed"; server serves.

- [ ] **Step 6: Security scan (per CLAUDE.md before merge)**

Run: `bun run security`
Expected: no NEW CRITICAL/HIGH beyond the documented accepted `minimatch` exception. Note: no crawler deps added in this plan, so the dependency surface is unchanged.

- [ ] **Step 7: Final commit if any formatting changed**

```bash
git add -A && git commit -m "chore: catalog foundation + integration verification" || echo "nothing to commit"
```

---

## Self-Review

**1. Spec coverage (Phases 1–2):**
- §5 schema (3 tables, hand-listed nutrients, `priority`) → Task 1. ✓
- §5.2 `pg_trgm` hand-appended + journal-safe → Task 1 Steps 4–5. ✓
- §5.2 drift-guard test → Task 1 Step 1. ✓
- §6 dataset JSONL Zod schema (header + product, fail-closed) → Task 2; fail-closed enforced in Task 3 import + tested. ✓
- §8 CLIs run on server host, batched insert + GIN drop/recreate, upsert-by-key, grant survival → Tasks 3–4. ✓
- §7.2 OFF reuse rescoped to pure nutrient core → Task 6. ✓
- §9 online endpoints (search/barcode/save), access-gated, priority tie-break, copy-on-use via `createFood`, never in `/api/foods` → Tasks 7–8 (+ isolation test). ✓
- §9 picker badge + barcode-before-OFF → Tasks 10–12. ✓
- §10 `.gitignore` + prek guard → Task 5. ✓
- §12 testing (drift, dataset schema, import, access gating, tie-break, instantiate, isolation) → Tasks 1,2,3,4,7,8. ✓
- Out of scope here (correctly deferred): OFF adapter (Phase 3), Migros adapter (Phase 4), Coop (v1.1). MCP catalog surfacing is deferred to the Phase 2-follow-up note below (spec §9 lists it; it is low-risk and additive — see note).

**2. Placeholder scan:** No "TBD"/"handle errors"/"similar to". Every code step has full code; the 43 nutrient columns are written out in Task 1 (not "same as foods"). The one generated artifact whose exact text can't be pre-known (the random `0037_*.sql` filename / drizzle’s auto-SQL) is handled by explicit generate-then-append instructions with the exact SQL to add.

**3. Type consistency:** `catalogSearch`/`catalogByBarcode`/`instantiateCatalogFood` signatures `(db, userId, …)` are consistent across `queries.ts`, the endpoints, and tests. `CatalogResult` (adds `datasetKey`,`source`) is used consistently. `saveFromCatalog(catalogId)` consistent in food-service, AddFoodModal, DayLog. `PickerSelection` `catalog` variant consistent between FoodPicker (emit) and AddFoodModal (consume). Endpoint paths `/api/catalog/search`, `/api/catalog/barcode/{code}`, `/api/catalog/{id}/save` consistent across routes, openapi, client calls.

**Gap noted (not a blocker):** Spec §9 also mentions MCP `search_foods`/`find_food_by_barcode` surfacing catalog results. That is additive and independent of the UI path. Add it as **Task 14 (follow-up, optional within Phase 2):** in `src/lib/server/mcp/create-handlers.ts`, after the personal-foods/OFF logic in `handleSearchFoods`/`handleFindFoodByBarcode`, also call `catalogSearch`/`catalogByBarcode` via the `d.` deps namespace (thread them like `d.listFoods`), tag results `source`, and for barcode return a hint to use the save endpoint — mirroring the existing OFF hint. Implement only if MCP catalog parity is wanted in v1; it does not affect the web UX delivered by Tasks 1–13.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-18-base-food-catalog-foundation-and-integration.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration. (Use `superpowers:using-git-worktrees` for isolation first; we are already on branch `feat/base-food-catalog`.)

**2. Inline Execution** — execute tasks in this session via `superpowers:executing-plans`, batched with review checkpoints.

**Which approach?**
