import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { strFromU8, unzipSync } from 'fflate';
import {
	foodEntries,
	foods,
	recipeIngredients,
	recipeSteps,
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

const DB_NAME = `test_recipe_steps_${randomUUID().replaceAll('-', '')}`;
let dbUrl: string;
let uploadDir: string;
let db: ReturnType<typeof getTestDB>;
let recipesModule: typeof import('$lib/server/recipes');
let images: typeof import('$lib/server/images');

let alice: string;
let bob: string;
let oatsId: string;

const macros = { calories: 100, protein: 1, carbs: 2, fat: 3, fiber: 4 };

async function storeImage(userId: string) {
	const buffer = await sharp({
		create: { width: 4, height: 4, channels: 3, background: '#336699' }
	})
		.png()
		.toBuffer();
	return images.processImage(new File([new Uint8Array(buffer)], 'step.png'), userId, {
		maxDim: images.RECIPE_STEP_MAX_DIM,
		fit: 'inside'
	});
}

const fileOf = (url: string) => join(uploadDir, url.slice('/uploads/'.length));
const uploadRows = () => db.select().from(uploads);

async function create(userId: string, body: Record<string, unknown> = {}) {
	const result = await recipesModule.createRecipe(userId, {
		name: 'Porridge',
		totalServings: 2,
		ingredients: [{ foodId: oatsId, quantity: 80, servingUnit: 'g' }],
		...body
	});
	if (!result.success) throw new Error('create failed');
	return result.data.id;
}

beforeAll(async () => {
	dbUrl = await createTestDatabase(DB_NAME);
	await runTestMigrations(dbUrl);
	db = getTestDB(dbUrl);
	vi.doMock('$lib/server/db', () => ({ getDB: () => db }));
	uploadDir = await mkdtemp(join(tmpdir(), 'bissbilanz-recipe-steps-'));
	vi.stubEnv('UPLOAD_DIR', uploadDir);
	images = await import('$lib/server/images');
	recipesModule = await import('$lib/server/recipes');
});

afterAll(async () => {
	vi.unstubAllEnvs();
	if (uploadDir) await rm(uploadDir, { recursive: true, force: true });
	if (dbUrl) await closeTestDB(dbUrl);
	await dropTestDatabase(DB_NAME);
});

beforeEach(async () => {
	await db.delete(foodEntries);
	await db.delete(recipeSteps);
	await db.delete(recipeIngredients);
	await db.delete(recipes);
	await db.delete(uploads);
	await db.delete(foods);
	await db.delete(users);
	const [a, b] = await db
		.insert(users)
		.values([{ infomaniakSub: 'steps-alice' }, { infomaniakSub: 'steps-bob' }])
		.returning();
	alice = a.id;
	bob = b.id;
	const [oats] = await db
		.insert(foods)
		.values({ userId: alice, name: 'Oats', servingSize: 100, servingUnit: 'g', ...macros })
		.returning();
	oatsId = oats.id;
});

describe('recipe steps', () => {
	it('creates steps in order and returns them on the detail and a count on the list', async () => {
		const id = await create(alice, {
			steps: [{ text: '  Boil the milk  ' }, { text: 'Stir in the oats', imageUrl: null }]
		});

		const recipe = await recipesModule.getRecipe(alice, id);
		expect(recipe!.steps).toMatchObject([
			{ sortOrder: 0, text: 'Boil the milk', imageUrl: null },
			{ sortOrder: 1, text: 'Stir in the oats', imageUrl: null }
		]);
		expect(recipe!.steps[0].id).toMatch(/^[0-9a-f-]{36}$/);

		const { items } = await recipesModule.listRecipes(alice);
		expect(items[0].stepCount).toBe(2);
	});

	it('a recipe without steps has an empty list and a zero count', async () => {
		const id = await create(alice);
		expect((await recipesModule.getRecipe(alice, id))!.steps).toEqual([]);
		expect((await recipesModule.listRecipes(alice)).items[0].stepCount).toBe(0);
	});

	it('the step count does not distort the macro totals of a multi-ingredient recipe', async () => {
		const [honey] = await db
			.insert(foods)
			.values({ userId: alice, name: 'Honey', servingSize: 100, servingUnit: 'g', ...macros })
			.returning();
		const id = await create(alice, {
			ingredients: [
				{ foodId: oatsId, quantity: 100, servingUnit: 'g' },
				{ foodId: honey.id, quantity: 100, servingUnit: 'g' }
			],
			steps: [{ text: 'a' }, { text: 'b' }, { text: 'c' }]
		});
		const { items } = await recipesModule.listRecipes(alice);
		expect(items[0]).toMatchObject({ id, calories: 200, stepCount: 3 });
	});

	it('update: omitted steps stay, a list replaces all, an empty list clears', async () => {
		const id = await create(alice, { steps: [{ text: 'one' }, { text: 'two' }] });

		await recipesModule.updateRecipe(alice, id, { name: 'Renamed' });
		expect((await recipesModule.getRecipe(alice, id))!.steps.map((s) => s.text)).toEqual([
			'one',
			'two'
		]);

		await recipesModule.updateRecipe(alice, id, {
			steps: [{ text: 'three' }, { text: 'one again' }, { text: 'four' }]
		});
		const replaced = (await recipesModule.getRecipe(alice, id))!.steps;
		expect(replaced.map((s) => [s.sortOrder, s.text])).toEqual([
			[0, 'three'],
			[1, 'one again'],
			[2, 'four']
		]);

		await recipesModule.updateRecipe(alice, id, { steps: [] });
		expect((await recipesModule.getRecipe(alice, id))!.steps).toEqual([]);
		expect(await db.select().from(recipeSteps)).toHaveLength(0);
	});

	it('updating ingredients does not touch steps', async () => {
		const id = await create(alice, { steps: [{ text: 'keep me' }] });
		await recipesModule.updateRecipe(alice, id, {
			ingredients: [{ foodId: oatsId, quantity: 10, servingUnit: 'g' }]
		});
		expect((await recipesModule.getRecipe(alice, id))!.steps).toHaveLength(1);
	});

	it('rejects empty text, too long text and more than 50 steps without writing anything', async () => {
		const bad = [
			[{ text: '   ' }],
			[{ text: 'x'.repeat(2001) }],
			Array.from({ length: 51 }, (_, i) => ({ text: `step ${i}` }))
		];
		for (const steps of bad) {
			const result = await recipesModule.createRecipe(alice, {
				name: 'Bad',
				totalServings: 1,
				ingredients: [{ foodId: oatsId, quantity: 1, servingUnit: 'g' }],
				steps
			});
			expect(result.success).toBe(false);
		}
		expect(await db.select().from(recipes)).toHaveLength(0);
	});

	it("never exposes or changes another user's steps", async () => {
		const id = await create(alice, { steps: [{ text: 'secret method' }] });

		expect(await recipesModule.getRecipe(bob, id)).toBeNull();

		const update = await recipesModule.updateRecipe(bob, id, { steps: [{ text: 'hijacked' }] });
		expect(update).toMatchObject({ success: true, data: null });
		const rows = await db.select().from(recipeSteps);
		expect(rows.map((row) => row.text)).toEqual(['secret method']);

		await recipesModule.deleteRecipe(bob, id, true);
		expect(await db.select().from(recipeSteps)).toHaveLength(1);
	});

	it('an LWW-rejected update leaves the steps alone', async () => {
		const id = await create(alice, { steps: [{ text: 'original' }] });
		const stale = new Date(Date.now() - 60 * 60 * 1000);
		const result = await recipesModule.updateRecipe(alice, id, { steps: [{ text: 'old' }] }, stale);
		expect(result).toMatchObject({ success: true, data: null });
		expect((await recipesModule.getRecipe(alice, id))!.steps[0].text).toBe('original');
	});

	it('deleting the recipe cascades to its steps', async () => {
		const id = await create(alice, { steps: [{ text: 'gone soon' }] });
		await recipesModule.deleteRecipe(alice, id);
		expect(await db.select().from(recipeSteps)).toHaveLength(0);
	});
});

describe('recipe step images', () => {
	it('unlinks a step image when the step is dropped, the recipe is replaced or deleted', async () => {
		const first = await storeImage(alice);
		const second = await storeImage(alice);
		const id = await create(alice, {
			steps: [
				{ text: 'a', imageUrl: first },
				{ text: 'b', imageUrl: second }
			]
		});
		expect(existsSync(fileOf(first))).toBe(true);

		await recipesModule.updateRecipe(alice, id, {
			steps: [{ text: 'b', imageUrl: second }]
		});
		expect(existsSync(fileOf(first))).toBe(false);
		expect(existsSync(fileOf(second))).toBe(true);
		expect((await uploadRows()).map((r) => `/uploads/${r.filename}`)).toEqual([second]);

		await recipesModule.updateRecipe(alice, id, { steps: [] });
		expect(existsSync(fileOf(second))).toBe(false);
		expect(await uploadRows()).toHaveLength(0);
	});

	it('deleting the recipe removes its step images', async () => {
		const image = await storeImage(alice);
		const id = await create(alice, { steps: [{ text: 'a', imageUrl: image }] });
		await recipesModule.deleteRecipe(alice, id);
		expect(existsSync(fileOf(image))).toBe(false);
		expect(await uploadRows()).toHaveLength(0);
	});

	it('keeps a file another recipe still uses (duplicated recipe)', async () => {
		const shared = await storeImage(alice);
		const original = await create(alice, {
			name: 'Original',
			steps: [{ text: 'a', imageUrl: shared }]
		});
		const copy = await create(alice, { name: 'Copy', steps: [{ text: 'a', imageUrl: shared }] });

		await recipesModule.deleteRecipe(alice, original);
		expect(existsSync(fileOf(shared))).toBe(true);

		await recipesModule.deleteRecipe(alice, copy);
		expect(existsSync(fileOf(shared))).toBe(false);
	});

	it("does not delete an image that is not the caller's own upload", async () => {
		const bobs = await storeImage(bob);
		const id = await create(alice, { steps: [{ text: 'a', imageUrl: bobs }] });
		await recipesModule.updateRecipe(alice, id, { steps: [] });
		expect(existsSync(fileOf(bobs))).toBe(true);
	});

	it('leaves external image links alone', async () => {
		const id = await create(alice, {
			steps: [{ text: 'a', imageUrl: 'https://example.com/step.jpg' }]
		});
		await recipesModule.updateRecipe(alice, id, { steps: [] });
		expect(await db.select().from(recipeSteps)).toHaveLength(0);
	});

	it('the orphan sweep counts step images as referenced', async () => {
		const used = await storeImage(alice);
		const abandoned = await storeImage(alice);
		await create(alice, { steps: [{ text: 'a', imageUrl: used }] });
		const { cleanupOrphanedImages } = await import('$lib/server/image-cleanup');
		await cleanupOrphanedImages(Date.now() + 7 * 24 * 60 * 60 * 1000);
		expect(existsSync(fileOf(used))).toBe(true);
		expect(existsSync(fileOf(abandoned))).toBe(false);
	});
});

describe('account export and import', () => {
	it('exports steps and their images and restores step text for a new account', async () => {
		const image = await storeImage(alice);
		const id = await create(alice, {
			steps: [{ text: 'Boil, "gently"', imageUrl: image }, { text: 'Serve' }]
		});

		const { buildAccountExport } = await import('$lib/server/export');
		const entries = unzipSync(await buildAccountExport(alice));
		const json = JSON.parse(strFromU8(entries['bissbilanz.json']));
		expect(json.recipeSteps).toMatchObject([
			{ recipeId: id, sortOrder: 0, text: 'Boil, "gently"', imageUrl: image },
			{ recipeId: id, sortOrder: 1, text: 'Serve', imageUrl: null }
		]);
		expect(entries[`images/${image.slice('/uploads/'.length)}`]).toBeDefined();
		const csv = strFromU8(entries['csv/recipe-steps.csv'])
			.replace(/^﻿/, '')
			.trimEnd()
			.split('\r\n');
		expect(csv[0]).toBe('recipe,step,text,image');
		expect(csv[1]).toBe(`Porridge,1,"Boil, ""gently""",images/${image.slice('/uploads/'.length)}`);

		const { parseImportFile, runImport } = await import('$lib/server/import');
		const file = new File([entries['bissbilanz.json']], 'bissbilanz.json');
		const parsed = await parseImportFile(file, 'UTC');

		// Importing over the account that owns the recipe changes nothing.
		await runImport(alice, parsed, 'commit');
		expect(await db.select().from(recipeSteps)).toHaveLength(2);

		await wipeRecipes();
		await runImport(bob, parsed, 'commit');
		const bobRecipe = (await db.select().from(recipes).where(eq(recipes.userId, bob)))[0];
		const restored = (await recipesModule.getRecipe(bob, bobRecipe.id))!.steps;
		expect(restored.map((s) => [s.sortOrder, s.text, s.imageUrl])).toEqual([
			[0, 'Boil, "gently"', null],
			[1, 'Serve', null]
		]);
	});

	it('still imports an older archive without recipeSteps', async () => {
		const id = await create(alice);
		const { buildAccountExport } = await import('$lib/server/export');
		const entries = unzipSync(await buildAccountExport(alice));
		const json = JSON.parse(strFromU8(entries['bissbilanz.json']));
		delete json.recipeSteps;

		const { parseImportFile, runImport } = await import('$lib/server/import');
		const parsed = await parseImportFile(
			new File([JSON.stringify(json)], 'bissbilanz.json'),
			'UTC'
		);
		await wipeRecipes();
		await runImport(bob, parsed, 'commit');
		const bobRecipe = (await db.select().from(recipes).where(eq(recipes.userId, bob)))[0];
		expect(bobRecipe.id).toBe(id);
		expect((await recipesModule.getRecipe(bob, id))!.steps).toEqual([]);
	});
});

describe('food package', () => {
	it('round-trips steps and step images between accounts', async () => {
		const image = await storeImage(alice);
		const id = await create(alice, {
			steps: [{ text: 'Boil', imageUrl: image }, { text: 'Serve' }]
		});

		const { buildFoodPackage } = await import('$lib/server/food-package/export');
		const { readFoodPackage } = await import('$lib/server/food-package/archive');
		const { planFoodPackageImport } = await import('$lib/server/food-package/plan');
		const { commitFoodPackageImport } = await import('$lib/server/food-package/commit');

		const { bytes } = await buildFoodPackage(alice, { recipeIds: [id] });
		const zip = unzipSync(bytes);
		const manifest = JSON.parse(strFromU8(zip['bissbilanz-foods.json']));
		expect(manifest.formatVersion).toBe(1);
		expect(manifest.recipes[0].steps).toEqual([
			{ text: 'Boil', image: 'images/r1s1.webp', imageUrl: null },
			{ text: 'Serve', image: null, imageUrl: null }
		]);
		expect(zip['images/r1s1.webp']).toBeDefined();

		const pkg = readFoodPackage(bytes);
		const { preview } = await planFoodPackageImport(bob, pkg);
		expect(preview.totals.images).toBe(1);
		const result = await commitFoodPackageImport(bob, pkg, {
			packageHash: preview.packageHash,
			foods: [],
			recipes: []
		});
		expect(result.created.recipes).toBe(1);
		expect(result.images).toBe(1);

		const [bobRecipe] = await db.select().from(recipes).where(eq(recipes.userId, bob));
		const steps = (await recipesModule.getRecipe(bob, bobRecipe.id))!.steps;
		expect(steps.map((s) => s.text)).toEqual(['Boil', 'Serve']);
		expect(steps[0].imageUrl).toMatch(/^\/uploads\/[a-f0-9-]+\.webp$/);
		expect(steps[0].imageUrl).not.toBe(image);
		const owned = await db.select().from(uploads).where(eq(uploads.userId, bob));
		expect(owned.map((row) => `/uploads/${row.filename}`)).toEqual([steps[0].imageUrl]);
	});

	it('an older package without steps imports, and replacing keeps existing steps', async () => {
		const id = await create(alice, { name: 'Porridge' });
		const { buildFoodPackage } = await import('$lib/server/food-package/export');
		const { readFoodPackage } = await import('$lib/server/food-package/archive');
		const { planFoodPackageImport } = await import('$lib/server/food-package/plan');
		const { commitFoodPackageImport } = await import('$lib/server/food-package/commit');
		const { strToU8, zipSync } = await import('fflate');

		const { bytes } = await buildFoodPackage(alice, { recipeIds: [id] });
		const manifest = JSON.parse(strFromU8(unzipSync(bytes)['bissbilanz-foods.json']));
		for (const recipe of manifest.recipes) delete recipe.steps;
		const old = zipSync({ 'bissbilanz-foods.json': strToU8(JSON.stringify(manifest)) });

		// Bob already has a "Porridge" with steps: replacing it with an older package keeps them.
		const [bobOats] = await db
			.insert(foods)
			.values({ userId: bob, name: 'Oats', servingSize: 100, servingUnit: 'g', ...macros })
			.returning();
		const bobRecipe = await create(bob, {
			name: 'Porridge',
			ingredients: [{ foodId: bobOats.id, quantity: 5, servingUnit: 'g' }],
			steps: [{ text: 'Bobs own method' }]
		});

		const pkg = readFoodPackage(old);
		const { preview } = await planFoodPackageImport(bob, pkg);
		expect(preview.conflicts.recipes).toHaveLength(1);
		await commitFoodPackageImport(bob, pkg, {
			packageHash: preview.packageHash,
			foods: preview.conflicts.foods.map((c) => ({
				ref: c.ref,
				existingId: c.existing.id,
				action: 'skip' as const
			})),
			recipes: preview.conflicts.recipes.map((c) => ({
				ref: c.ref,
				existingId: c.existing.id,
				action: 'replace' as const
			}))
		});
		expect((await recipesModule.getRecipe(bob, bobRecipe))!.steps.map((s) => s.text)).toEqual([
			'Bobs own method'
		]);
	});

	it('replacing a recipe with a package that has steps replaces them and frees old images', async () => {
		const aliceImage = await storeImage(alice);
		const id = await create(alice, {
			steps: [{ text: 'New method', imageUrl: aliceImage }]
		});
		const bobImage = await storeImage(bob);
		const [bobOats] = await db
			.insert(foods)
			.values({ userId: bob, name: 'Oats', servingSize: 100, servingUnit: 'g', ...macros })
			.returning();
		const bobRecipe = await create(bob, {
			ingredients: [{ foodId: bobOats.id, quantity: 5, servingUnit: 'g' }],
			steps: [{ text: 'Old method', imageUrl: bobImage }]
		});

		const { buildFoodPackage } = await import('$lib/server/food-package/export');
		const { readFoodPackage } = await import('$lib/server/food-package/archive');
		const { planFoodPackageImport } = await import('$lib/server/food-package/plan');
		const { commitFoodPackageImport } = await import('$lib/server/food-package/commit');

		const pkg = readFoodPackage((await buildFoodPackage(alice, { recipeIds: [id] })).bytes);
		const { preview } = await planFoodPackageImport(bob, pkg);
		await commitFoodPackageImport(bob, pkg, {
			packageHash: preview.packageHash,
			foods: preview.conflicts.foods.map((c) => ({
				ref: c.ref,
				existingId: c.existing.id,
				action: 'skip' as const
			})),
			recipes: preview.conflicts.recipes.map((c) => ({
				ref: c.ref,
				existingId: c.existing.id,
				action: 'replace' as const
			}))
		});

		const steps = (await recipesModule.getRecipe(bob, bobRecipe))!.steps;
		expect(steps.map((s) => s.text)).toEqual(['New method']);
		expect(steps[0].imageUrl).not.toBe(bobImage);
		expect(existsSync(fileOf(bobImage))).toBe(false);
		expect(existsSync(fileOf(steps[0].imageUrl!))).toBe(true);
	});
});

// An account import restores ids, so the source rows must be gone first (as after
// deleting the account) — ids owned by another account are refused by design.
async function wipeRecipes() {
	await db.delete(recipeSteps);
	await db.delete(recipeIngredients);
	await db.delete(recipes);
	await db.delete(foods);
}
