import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import {
	createTestDatabase,
	dropTestDatabase,
	runTestMigrations,
	getTestDB,
	closeTestDB
} from './helpers';
import { users, foods } from '$lib/server/schema';

const DB_NAME = 'test_food_duplicates';
let dbUrl: string;

beforeAll(async () => {
	dbUrl = await createTestDatabase(DB_NAME);
	await runTestMigrations(dbUrl);

	const db = getTestDB(dbUrl);
	vi.doMock('$lib/server/db', () => ({
		getDB: () => db
	}));
});

afterAll(async () => {
	await closeTestDB(dbUrl);
	await dropTestDatabase(DB_NAME);
});

let userId: string;

beforeEach(async () => {
	const db = getTestDB(dbUrl);
	await db.delete(foods);
	await db.delete(users);

	const [user] = await db
		.insert(users)
		.values({ infomaniakSub: `duplicates-test-${Date.now()}` })
		.returning();
	userId = user.id;
});

const baseFood = {
	servingSize: 100,
	servingUnit: 'g' as const,
	calories: 60,
	protein: 10,
	carbs: 4,
	fat: 0,
	fiber: 0
};

describe('findDuplicateGroups (integration)', () => {
	// Note: `idx_foods_barcode` is a unique index on (userId, barcode), so two
	// real rows can never share the exact same barcode string. The `barcode`
	// reason therefore only fires for different encodings of one product
	// (UPC-A vs EAN-13), which the index does not catch.

	it('groups the UPC-A and EAN-13 encodings of one product by barcode', async () => {
		const db = getTestDB(dbUrl);
		await db.insert(foods).values([
			{ userId, name: 'Greek Yogurt', barcode: '036000291452', ...baseFood },
			{ userId, name: 'Greek Yoghurt', barcode: '0036000291452', ...baseFood }
		]);

		const { findDuplicateGroups } = await import('$lib/server/food-duplicates');
		const groups = await findDuplicateGroups(userId);
		const barcodeGroups = groups.filter((g) => g.reason === 'barcode');
		expect(barcodeGroups).toHaveLength(1);
		expect(barcodeGroups[0].foods).toHaveLength(2);
	});

	it('does not group similar foods that carry different barcodes', async () => {
		const db = getTestDB(dbUrl);
		await db.insert(foods).values([
			{ userId, name: 'Mate Zero', brand: 'El Tony', barcode: '7640150491254', ...baseFood },
			{ userId, name: 'Mate Zero', brand: 'Moa', barcode: '7627538064729', ...baseFood }
		]);

		const { findDuplicateGroups } = await import('$lib/server/food-duplicates');
		expect(await findDuplicateGroups(userId)).toEqual([]);
	});

	it('groups foods by name+brand, case/whitespace/diacritics-insensitively', async () => {
		const db = getTestDB(dbUrl);
		await db.insert(foods).values([
			{ userId, name: 'Müller Reis', brand: 'Müller', ...baseFood },
			{ userId, name: '  MULLER   REIS ', brand: 'muller', ...baseFood }
		]);

		const { findDuplicateGroups } = await import('$lib/server/food-duplicates');
		const groups = await findDuplicateGroups(userId);
		const nameBrandGroups = groups.filter((g) => g.reason === 'name_brand');
		expect(nameBrandGroups).toHaveLength(1);
		expect(nameBrandGroups[0].foods).toHaveLength(2);
	});

	it('groups foods with similar names and near-identical macros, without a shared barcode or exact name/brand match', async () => {
		const db = getTestDB(dbUrl);
		await db.insert(foods).values([
			{
				userId,
				name: 'Chicken Breast',
				...baseFood,
				calories: 165,
				protein: 31,
				carbs: 0,
				fat: 3.6
			},
			{
				userId,
				name: 'Chicken Breasts',
				...baseFood,
				calories: 166,
				protein: 31.2,
				carbs: 0,
				fat: 3.5
			}
		]);

		const { findDuplicateGroups } = await import('$lib/server/food-duplicates');
		const groups = await findDuplicateGroups(userId);
		const similarGroups = groups.filter((g) => g.reason === 'similar');
		expect(similarGroups).toHaveLength(1);
		expect(similarGroups[0].foods).toHaveLength(2);
	});

	it('does not group unrelated foods', async () => {
		const db = getTestDB(dbUrl);
		await db.insert(foods).values([
			{ userId, name: 'Greek Yogurt', ...baseFood },
			{
				userId,
				name: 'Chicken Breast',
				...baseFood,
				calories: 165,
				protein: 31,
				carbs: 0,
				fat: 3.6
			}
		]);

		const { findDuplicateGroups } = await import('$lib/server/food-duplicates');
		const groups = await findDuplicateGroups(userId);
		expect(groups).toHaveLength(0);
	});

	it('scopes to the requesting user only', async () => {
		const db = getTestDB(dbUrl);
		const [otherUser] = await db
			.insert(users)
			.values({ infomaniakSub: `other-duplicates-${Date.now()}` })
			.returning();

		await db.insert(foods).values([
			{ userId, name: 'Greek Yogurt', barcode: '999', ...baseFood },
			{ userId: otherUser.id, name: 'Greek Yogurt', barcode: '999', ...baseFood }
		]);

		const { findDuplicateGroups } = await import('$lib/server/food-duplicates');
		const groups = await findDuplicateGroups(userId);
		expect(groups.filter((g) => g.reason === 'barcode')).toHaveLength(0);
	});
});
