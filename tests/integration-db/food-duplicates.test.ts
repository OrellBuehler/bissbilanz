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
	it('groups foods sharing a barcode with similar names', async () => {
		const db = getTestDB(dbUrl);
		await db.insert(foods).values([
			{ userId, name: 'Greek Yogurt', barcode: '1234567890', ...baseFood },
			{ userId, name: 'Greek Yogurt (import)', barcode: '1234567890', ...baseFood }
		]);

		const { findDuplicateGroups } = await import('$lib/server/food-duplicates');
		const groups = await findDuplicateGroups(userId);
		const barcodeGroups = groups.filter((g) => g.reason === 'barcode');
		expect(barcodeGroups).toHaveLength(1);
		expect(barcodeGroups[0].foods).toHaveLength(2);
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
