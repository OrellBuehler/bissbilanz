import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { strToU8, zipSync, type Zippable } from 'fflate';
import { foods, uploads, users } from '$lib/server/schema';
import {
	closeTestDB,
	createTestDatabase,
	dropTestDatabase,
	getTestDB,
	runTestMigrations
} from './helpers';

const DB_NAME = `test_food_package_images_${randomUUID().replaceAll('-', '')}`;
const FOOD_COUNT = 450;
const SHARED_IMAGE_FOODS = 20;
const TINY_TOTAL_CAP = 5000;

let dbUrl: string;
let uploadDir: string;
let db: ReturnType<typeof getTestDB>;
let archive: typeof import('$lib/server/food-package/archive');
let plan: typeof import('$lib/server/food-package/plan');
let commit: typeof import('$lib/server/food-package/commit');
let imageSize = 0;

const buildPackage = async () => {
	const image = new Uint8Array(
		await sharp({ create: { width: 4, height: 4, channels: 3, background: '#336699' } })
			.webp()
			.toBuffer()
	);
	imageSize = image.length;
	const files: Zippable = {};
	const manifestFoods = Array.from({ length: FOOD_COUNT }, (_, index) => {
		const ref = `f${index + 1}`;
		const path = index < SHARED_IMAGE_FOODS ? 'images/shared.webp' : `images/${ref}.webp`;
		files[path] = [image, { level: 0 }];
		return {
			ref,
			role: 'selected',
			name: `Bulk food ${index + 1}`,
			servingSize: 100,
			servingUnit: 'g',
			calories: 100,
			protein: 1,
			carbs: 2,
			fat: 3,
			fiber: 4,
			image: path
		};
	});
	files['bissbilanz-foods.json'] = strToU8(
		JSON.stringify({
			format: 'bissbilanz.food-package',
			formatVersion: 1,
			foods: manifestFoods,
			recipes: []
		})
	);
	return zipSync(files);
};

beforeAll(async () => {
	dbUrl = await createTestDatabase(DB_NAME);
	await runTestMigrations(dbUrl);
	db = getTestDB(dbUrl);
	vi.doMock('$lib/server/db', () => ({ getDB: () => db }));
	vi.doMock('$lib/server/food-package/format', async (original) => ({
		...(await original<typeof import('$lib/server/food-package/format')>()),
		MAX_TOTAL_INFLATED_BYTES: TINY_TOTAL_CAP,
		MAX_IMAGE_ENTRY_BYTES: 1000
	}));
	uploadDir = await mkdtemp(join(tmpdir(), 'bissbilanz-food-package-images-'));
	vi.stubEnv('UPLOAD_DIR', uploadDir);
	archive = await import('$lib/server/food-package/archive');
	plan = await import('$lib/server/food-package/plan');
	commit = await import('$lib/server/food-package/commit');
});

afterAll(async () => {
	vi.unstubAllEnvs();
	vi.doUnmock('$lib/server/food-package/format');
	if (uploadDir) await rm(uploadDir, { recursive: true, force: true });
	if (dbUrl) await closeTestDB(dbUrl);
	await dropTestDatabase(DB_NAME);
});

describe('package import images', () => {
	it('imports every image of a package bigger than one batch and than the inflate cap', async () => {
		const [carol] = await db.insert(users).values({ infomaniakSub: 'package-images' }).returning();
		const pkg = archive.readFoodPackage(await buildPackage());
		expect(imageSize * (FOOD_COUNT - SHARED_IMAGE_FOODS)).toBeGreaterThan(TINY_TOTAL_CAP * 2);

		const { preview } = await plan.planFoodPackageImport(carol.id, pkg);
		const result = await commit.commitFoodPackageImport(carol.id, pkg, {
			packageHash: preview.packageHash,
			foods: [],
			recipes: []
		});

		expect(result.issues).toEqual([]);
		expect(result.created.foods).toBe(FOOD_COUNT);
		expect(result.images).toBe(FOOD_COUNT);
		const rows = await db.select().from(foods).where(eq(foods.userId, carol.id));
		expect(rows).toHaveLength(FOOD_COUNT);
		expect(rows.every((row) => row.imageUrl?.startsWith('/uploads/'))).toBe(true);
		expect(new Set(rows.map((row) => row.imageUrl)).size).toBe(FOOD_COUNT);
		expect(await db.select().from(uploads).where(eq(uploads.userId, carol.id))).toHaveLength(
			FOOD_COUNT
		);
		expect(await readdir(uploadDir)).toHaveLength(FOOD_COUNT);
	});

	it('lists only the first new foods of a very big package in the preview', async () => {
		const [dan] = await db.insert(users).values({ infomaniakSub: 'package-preview' }).returning();
		const manifestFoods = Array.from({ length: 2100 }, (_, index) => ({
			ref: `f${index + 1}`,
			role: 'selected',
			name: `Preview food ${index + 1}`,
			servingSize: 100,
			servingUnit: 'g',
			calories: 100,
			protein: 1,
			carbs: 2,
			fat: 3,
			fiber: 4
		}));
		const pkg = archive.readFoodPackage(
			strToU8(
				JSON.stringify({
					format: 'bissbilanz.food-package',
					formatVersion: 1,
					foods: manifestFoods,
					recipes: []
				})
			)
		);

		const { preview } = await plan.planFoodPackageImport(dan.id, pkg);
		expect(preview.newFoods.count).toBe(2100);
		expect(preview.newFoods.items).toHaveLength(2000);
		expect(preview.newFoods.itemsTruncated).toBe(true);
		expect(preview.newFoods.items[0].ref).toBe('f1');

		const small = await plan.planFoodPackageImport(
			dan.id,
			archive.readFoodPackage(
				strToU8(
					JSON.stringify({
						format: 'bissbilanz.food-package',
						formatVersion: 1,
						foods: manifestFoods.slice(0, 5),
						recipes: []
					})
				)
			)
		);
		expect(small.preview.newFoods.items).toHaveLength(5);
		expect(small.preview.newFoods.itemsTruncated).toBeUndefined();
	});
});
