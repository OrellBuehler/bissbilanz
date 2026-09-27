import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { strFromU8, unzipSync } from 'fflate';
import {
	foodEntries,
	foodLabels,
	foods,
	recipeIngredients,
	recipes,
	uploads,
	users
} from '$lib/server/schema';
import {
	closeTestDB,
	createTestDatabase,
	dropTestDatabase,
	getTestDB,
	runTestMigrations
} from './helpers';

const DB_NAME = `test_food_package_${randomUUID().replaceAll('-', '')}`;
let dbUrl: string;
let uploadDir: string;
let db: ReturnType<typeof getTestDB>;
let exporter: typeof import('$lib/server/food-package/export');
let archive: typeof import('$lib/server/food-package/archive');
let plan: typeof import('$lib/server/food-package/plan');
let commit: typeof import('$lib/server/food-package/commit');

const OFF_IMAGE = 'https://images.openfoodfacts.org/images/products/761/front.jpg';

let alice: string;
let bob: string;
const ids: Record<string, string> = {};

const macros = { calories: 100, protein: 1, carbs: 2, fat: 3, fiber: 4 };

async function png(color: string) {
	const buffer = await sharp({ create: { width: 4, height: 4, channels: 3, background: color } })
		.webp()
		.toBuffer();
	return new Uint8Array(buffer);
}

async function storeUpload(userId: string, color: string) {
	const filename = `${randomUUID()}.webp`;
	await writeFile(join(uploadDir, filename), await png(color));
	await db.insert(uploads).values({ filename, userId });
	return `/uploads/${filename}`;
}

async function insertFood(userId: string, values: Partial<typeof foods.$inferInsert>) {
	const [row] = await db
		.insert(foods)
		.values({ userId, name: 'Food', servingSize: 100, servingUnit: 'g', ...macros, ...values })
		.returning();
	return row;
}

beforeAll(async () => {
	dbUrl = await createTestDatabase(DB_NAME);
	await runTestMigrations(dbUrl);
	db = getTestDB(dbUrl);
	vi.doMock('$lib/server/db', () => ({ getDB: () => db }));
	uploadDir = await mkdtemp(join(tmpdir(), 'bissbilanz-food-package-'));
	vi.stubEnv('UPLOAD_DIR', uploadDir);
	exporter = await import('$lib/server/food-package/export');
	archive = await import('$lib/server/food-package/archive');
	plan = await import('$lib/server/food-package/plan');
	commit = await import('$lib/server/food-package/commit');

	const [a, b] = await db
		.insert(users)
		.values([{ infomaniakSub: 'package-alice' }, { infomaniakSub: 'package-bob' }])
		.returning();
	alice = a.id;
	bob = b.id;

	// ── Alice's database (the exporter) ──
	const oats = await insertFood(alice, {
		name: 'Oats',
		brand: 'Migros',
		barcode: '7610000000001',
		imageUrl: await storeUpload(alice, '#aa8800'),
		sodium: 2
	});
	const milk = await insertFood(alice, {
		name: 'Milk',
		brand: 'Coop',
		servingUnit: 'ml',
		barcode: '7610000000002',
		imageUrl: OFF_IMAGE
	});
	const honey = await insertFood(alice, { name: 'Honey', brand: 'Imker' });
	const banana = await insertFood(alice, { name: 'Banana', brand: null });
	await insertFood(alice, { name: 'Vitamin D', kind: 'supplement' });
	await db.insert(foodLabels).values([
		{ foodId: oats.id, userId: alice, label: 'oat', source: 'user' },
		{ foodId: banana.id, userId: alice, label: 'banana', source: 'user' }
	]);
	const [porridge] = await db
		.insert(recipes)
		.values({
			userId: alice,
			name: 'Porridge',
			totalServings: 2,
			imageUrl: await storeUpload(alice, '#884400')
		})
		.returning();
	await db.insert(recipeIngredients).values([
		{ recipeId: porridge.id, foodId: oats.id, quantity: 80, servingUnit: 'g', sortOrder: 0 },
		{ recipeId: porridge.id, foodId: milk.id, quantity: 200, servingUnit: 'ml', sortOrder: 1 },
		{ recipeId: porridge.id, foodId: honey.id, quantity: 10, servingUnit: 'g', sortOrder: 2 }
	]);
	Object.assign(ids, { oats: oats.id, milk: milk.id, honey: honey.id, banana: banana.id });
	ids.porridge = porridge.id;

	// ── Bob's database (the importer) ──
	const bobOats = await insertFood(bob, {
		name: 'Haferflocken',
		barcode: '7610000000001',
		calories: 50,
		imageUrl: await storeUpload(bob, '#000000')
	});
	const bobMilk = await insertFood(bob, { name: 'milk', brand: 'COOP', servingUnit: 'ml' });
	await db.insert(foodEntries).values({
		userId: bob,
		foodId: bobOats.id,
		date: '2026-09-01',
		mealType: 'Breakfast',
		servings: 1
	});
	ids.bobOats = bobOats.id;
	ids.bobMilk = bobMilk.id;
});

afterAll(async () => {
	vi.unstubAllEnvs();
	if (uploadDir) await rm(uploadDir, { recursive: true, force: true });
	if (dbUrl) await closeTestDB(dbUrl);
	await dropTestDatabase(DB_NAME);
});

const manifestOf = (bytes: Uint8Array) =>
	JSON.parse(strFromU8(unzipSync(bytes)['bissbilanz-foods.json']));

describe('export selection', () => {
	it('filters by brand OR label, case-insensitively, without recipes', async () => {
		const { bytes } = await exporter.buildFoodPackage(alice, {
			brands: ['migros'],
			labels: ['banana']
		});
		const manifest = manifestOf(bytes);
		expect(manifest.foods.map((f: { name: string }) => f.name).sort()).toEqual(['Banana', 'Oats']);
		expect(manifest.recipes).toEqual([]);
	});

	it('pulls ingredient foods of related recipes into the package', async () => {
		const summary = await exporter.summarizePackage(alice, {
			brands: ['Migros'],
			includeRecipes: 'related'
		});
		expect(summary).toMatchObject({ foods: 1, recipes: 1, ingredientFoods: 2 });
	});

	it('exports everything except supplements, and ignores foreign ids', async () => {
		const { bytes } = await exporter.buildFoodPackage(alice, {
			all: true,
			foodIds: [ids.bobOats]
		});
		const manifest = manifestOf(bytes);
		expect(manifest.foods).toHaveLength(4);
		expect(manifest.foods.some((f: { name: string }) => f.name === 'Vitamin D')).toBe(false);
		expect(manifest.recipes).toHaveLength(1);
		const files = Object.keys(unzipSync(bytes));
		expect(files.filter((name) => name.startsWith('images/'))).toHaveLength(2);
		const milk = manifest.foods.find((f: { name: string }) => f.name === 'Milk');
		expect(milk).toMatchObject({ image: null, imageUrl: OFF_IMAGE });
		expect(JSON.stringify(manifest)).not.toContain(alice);
	});
});

describe('import', () => {
	let packageBytes: Uint8Array;

	beforeAll(async () => {
		({ bytes: packageBytes } = await exporter.buildFoodPackage(alice, { all: true }));
	});

	it('previews new items and conflicts', async () => {
		const pkg = archive.readFoodPackage(packageBytes);
		const { preview } = await plan.planFoodPackageImport(bob, pkg);
		expect(preview.totals).toEqual({ foods: 4, recipes: 1, images: 2 });
		const byName = Object.fromEntries(preview.conflicts.foods.map((c) => [c.incoming.name, c]));
		expect(byName.Oats).toMatchObject({
			reason: 'barcode',
			existing: { id: ids.bobOats, entryCount: 1 }
		});
		expect(byName.Oats.incoming.imageUrl).toMatch(/^data:image\/webp;base64,/);
		expect(byName.Milk).toMatchObject({ reason: 'name_brand', existing: { id: ids.bobMilk } });
		expect(preview.newFoods.count).toBe(2);
		expect(preview.newRecipes.count).toBe(1);
	});

	it('rejects a stale preview and a changed file without writing', async () => {
		const pkg = archive.readFoodPackage(packageBytes);
		const before = await db.select().from(foods).where(eq(foods.userId, bob));
		await expect(
			commit.commitFoodPackageImport(bob, pkg, {
				packageHash: '0'.repeat(64),
				foods: [],
				recipes: []
			})
		).rejects.toMatchObject({ status: 409, message: 'package_changed' });
		await expect(
			commit.commitFoodPackageImport(bob, pkg, {
				packageHash: pkg.packageHash,
				foods: [],
				recipes: []
			})
		).rejects.toMatchObject({ status: 409, message: 'stale_preview' });
		const after = await db.select().from(foods).where(eq(foods.userId, bob));
		expect(after).toHaveLength(before.length);
	});

	it('commits: replace keeps the id and entries, skip remaps ingredients', async () => {
		const pkg = archive.readFoodPackage(packageBytes);
		const { preview } = await plan.planFoodPackageImport(bob, pkg);
		const oldImage = (await db.select().from(foods).where(eq(foods.id, ids.bobOats)))[0].imageUrl!;
		const decisions: Record<string, 'replace' | 'skip'> = { Oats: 'replace', Milk: 'skip' };
		const result = await commit.commitFoodPackageImport(bob, pkg, {
			packageHash: preview.packageHash,
			foods: preview.conflicts.foods.map((c) => ({
				ref: c.ref,
				existingId: c.existing.id,
				action: decisions[c.incoming.name]
			})),
			recipes: []
		});
		expect(result).toMatchObject({
			created: { foods: 2, recipes: 1 },
			replaced: { foods: 1, recipes: 0 },
			skipped: { foods: 1, recipes: 0 },
			images: 2
		});

		const [oats] = await db.select().from(foods).where(eq(foods.id, ids.bobOats));
		expect(oats).toMatchObject({ name: 'Oats', brand: 'Migros', calories: 100, sodium: 2 });
		expect(oats.imageUrl).not.toBe(oldImage);
		// The superseded upload is gone, file and ownership row.
		expect(existsSync(join(uploadDir, oldImage.slice('/uploads/'.length)))).toBe(false);
		const [entry] = await db.select().from(foodEntries).where(eq(foodEntries.userId, bob));
		expect(entry.foodId).toBe(ids.bobOats);

		const labels = await db.select().from(foodLabels).where(eq(foodLabels.foodId, ids.bobOats));
		expect(labels).toMatchObject([{ label: 'oat', source: 'external' }]);

		// Every image Bob now references is owned by Bob.
		const bobFoods = await db.select().from(foods).where(eq(foods.userId, bob));
		const [porridge] = await db.select().from(recipes).where(eq(recipes.userId, bob));
		const owned = await db.select().from(uploads).where(eq(uploads.userId, bob));
		const ownedNames = new Set(owned.map((row) => `/uploads/${row.filename}`));
		expect(ownedNames.has(oats.imageUrl!)).toBe(true);
		expect(ownedNames.has(porridge.imageUrl!)).toBe(true);
		expect(bobFoods.find((f) => f.name === 'Milk')).toBeUndefined();

		const ingredients = await db
			.select()
			.from(recipeIngredients)
			.where(eq(recipeIngredients.recipeId, porridge.id));
		const ingredientIds = ingredients.map((row) => row.foodId);
		expect(ingredientIds).toContain(ids.bobOats);
		expect(ingredientIds).toContain(ids.bobMilk);
		const honey = bobFoods.find((f) => f.name === 'Honey')!;
		expect(ingredientIds).toContain(honey.id);
		expect(honey.isFavorite).toBe(false);
	});

	it('re-importing with everything skipped changes nothing', async () => {
		const pkg = archive.readFoodPackage(packageBytes);
		const { preview } = await plan.planFoodPackageImport(bob, pkg);
		expect(preview.newFoods.count).toBe(0);
		const before = await db.select().from(foods).where(eq(foods.userId, bob));
		const result = await commit.commitFoodPackageImport(bob, pkg, {
			packageHash: preview.packageHash,
			foods: preview.conflicts.foods.map((c) => ({
				ref: c.ref,
				existingId: c.existing.id,
				action: 'skip' as const
			})),
			recipes: preview.conflicts.recipes.map((c) => ({
				ref: c.ref,
				existingId: c.existing.id,
				action: 'skip' as const
			}))
		});
		expect(result.created).toEqual({ foods: 0, recipes: 0 });
		expect(result.images).toBe(0);
		const after = await db.select().from(foods).where(eq(foods.userId, bob));
		expect(after.map((f) => f.updatedAt)).toEqual(before.map((f) => f.updatedAt));
	});

	it('keep both on a barcode clash stores the copy without a barcode', async () => {
		const [carol] = await db.insert(users).values({ infomaniakSub: 'package-carol' }).returning();
		const carolOats = await insertFood(carol.id, { name: 'Oats', barcode: '7610000000001' });
		const { bytes } = await exporter.buildFoodPackage(alice, { brands: ['Migros'] });
		const pkg = archive.readFoodPackage(bytes);
		const { preview } = await plan.planFoodPackageImport(carol.id, pkg);
		await commit.commitFoodPackageImport(carol.id, pkg, {
			packageHash: preview.packageHash,
			foods: preview.conflicts.foods.map((c) => ({
				ref: c.ref,
				existingId: c.existing.id,
				action: 'keep_both' as const
			})),
			recipes: []
		});
		const rows = await db
			.select()
			.from(foods)
			.where(and(eq(foods.userId, carol.id), eq(foods.name, 'Oats')));
		expect(rows).toHaveLength(2);
		expect(rows.find((row) => row.id === carolOats.id)?.barcode).toBe('7610000000001');
		expect(rows.find((row) => row.id !== carolOats.id)?.barcode).toBeNull();
	});

	it('rolls back rows and image files when the transaction fails', async () => {
		const [dave] = await db.insert(users).values({ infomaniakSub: 'package-dave' }).returning();
		const pkg = archive.readFoodPackage(packageBytes);
		const { preview } = await plan.planFoodPackageImport(dave.id, pkg);
		const filesBefore = await readdir(uploadDir);

		const spy = vi.spyOn(db, 'transaction').mockImplementationOnce(async (run) =>
			run(
				new Proxy(db, {
					get(target, prop, receiver) {
						if (prop === 'insert') {
							return (table: unknown) =>
								table === recipes
									? { values: () => Promise.reject(new Error('boom')) }
									: target.insert(table as typeof foods);
						}
						return Reflect.get(target, prop, receiver);
					}
				}) as never
			)
		);
		await expect(
			commit.commitFoodPackageImport(dave.id, pkg, {
				packageHash: preview.packageHash,
				foods: [],
				recipes: []
			})
		).rejects.toThrow('boom');
		spy.mockRestore();

		// The proxy isn't a real transaction, so clean up the rows it let through —
		// what matters here is that the rendered files were unlinked.
		await db.delete(foods).where(eq(foods.userId, dave.id));
		await db.delete(uploads).where(eq(uploads.userId, dave.id));
		expect((await readdir(uploadDir)).sort()).toEqual(filesBefore.sort());
	});
});

describe('brands and label stats', () => {
	it('groups brand spellings and skips supplements', async () => {
		const { listFoodBrands } = await import('$lib/server/foods');
		await insertFood(alice, { name: 'Muesli', brand: ' migros ' });
		const brands = await listFoodBrands(alice);
		expect(brands.find((b) => b.brand.toLowerCase() === 'migros')?.count).toBe(2);
		expect(brands.some((b) => b.brand === '')).toBe(false);
	});

	it('counts labels per kind', async () => {
		const { listLabelStats } = await import('$lib/server/food-labels');
		const [supplement] = await db
			.select()
			.from(foods)
			.where(and(eq(foods.userId, alice), eq(foods.kind, 'supplement')));
		await db
			.insert(foodLabels)
			.values({ foodId: supplement.id, userId: alice, label: 'pill', source: 'user' });
		const all = await listLabelStats(alice);
		const onlyFoods = await listLabelStats(alice, { kind: 'food' });
		expect(all.map((row) => row.label)).toContain('pill');
		expect(onlyFoods.map((row) => row.label)).not.toContain('pill');
		expect(onlyFoods.map((row) => row.label)).toEqual(expect.arrayContaining(['banana', 'oat']));
	});
});
