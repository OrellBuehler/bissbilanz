import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
	createTestDatabase,
	dropTestDatabase,
	runTestMigrations,
	getTestDB,
	closeTestDB
} from './helpers';
import { users, foods, foodLabels } from '$lib/server/schema';

const DB_NAME = 'test_food_labels';
let dbUrl: string;

beforeAll(async () => {
	dbUrl = await createTestDatabase(DB_NAME);
	await runTestMigrations(dbUrl);

	const db = getTestDB(dbUrl);
	vi.doMock('$lib/server/db', () => ({ getDB: () => db }));
});

afterAll(async () => {
	await closeTestDB(dbUrl);
	await dropTestDatabase(DB_NAME);
});

let userId: string;
let otherUserId: string;
let foodId: string;
let otherFoodId: string;

beforeEach(async () => {
	const db = getTestDB(dbUrl);
	await db.delete(foodLabels);
	await db.delete(foods);
	await db.delete(users);

	const [user] = await db
		.insert(users)
		.values({ infomaniakSub: `labels-test-${Date.now()}` })
		.returning();
	userId = user.id;
	const [other] = await db
		.insert(users)
		.values({ infomaniakSub: `labels-other-${Date.now()}` })
		.returning();
	otherUserId = other.id;

	const base = {
		servingSize: 100,
		servingUnit: 'g' as const,
		calories: 89,
		protein: 1.1,
		carbs: 23,
		fat: 0.3,
		fiber: 2.6
	};
	const [banana] = await db
		.insert(foods)
		.values({ userId, name: 'Banane', ...base })
		.returning();
	foodId = banana.id;
	const [bread] = await db
		.insert(foods)
		.values({ userId, name: 'Brot', ...base })
		.returning();
	otherFoodId = bread.id;
});

const sourcesFor = async (id: string) => {
	const db = getTestDB(dbUrl);
	const rows = await db
		.select({ label: foodLabels.label, source: foodLabels.source })
		.from(foodLabels)
		.where(eq(foodLabels.foodId, id))
		.orderBy(foodLabels.label);
	return rows;
};

describe('food labels', () => {
	it('normalizes and stores on write, and reads back sorted', async () => {
		const { setFoodLabels, getFoodLabels } = await import('$lib/server/food-labels');

		expect(await setFoodLabels(userId, foodId, ['Bananas', 'FRUIT', 'bananas'], 'llm')).toEqual([
			'banana',
			'fruit'
		]);

		const rows = await getFoodLabels(userId, foodId);
		expect(rows.map((r) => r.label)).toEqual(['banana', 'fruit']);
		expect(rows.every((r) => r.source === 'llm')).toBe(true);
	});

	it('is idempotent — a re-run cannot duplicate', async () => {
		const { setFoodLabels } = await import('$lib/server/food-labels');
		await setFoodLabels(userId, foodId, ['banana', 'fruit'], 'llm');
		await setFoodLabels(userId, foodId, ['banana', 'fruit'], 'llm');
		expect(await sourcesFor(foodId)).toHaveLength(2);
	});

	it('replaces only its own source', async () => {
		const { setFoodLabels } = await import('$lib/server/food-labels');
		await setFoodLabels(userId, foodId, ['snack'], 'user');
		await setFoodLabels(userId, foodId, ['banana'], 'llm');

		// A second llm run drops "banana" but must leave the user's "snack".
		await setFoodLabels(userId, foodId, ['fruit'], 'llm');
		expect(await sourcesFor(foodId)).toEqual([
			{ label: 'fruit', source: 'llm' },
			{ label: 'snack', source: 'user' }
		]);
	});

	it('an llm write does not clobber a user label of the same name', async () => {
		const { setFoodLabels } = await import('$lib/server/food-labels');
		await setFoodLabels(userId, foodId, ['banana'], 'user');
		await setFoodLabels(userId, foodId, ['banana', 'fruit'], 'llm');

		// The conflicting row stays with the user, so a later llm sweep that drops
		// "banana" cannot take the user's assertion with it.
		expect(await sourcesFor(foodId)).toEqual([
			{ label: 'banana', source: 'user' },
			{ label: 'fruit', source: 'llm' }
		]);

		await setFoodLabels(userId, foodId, [], 'llm');
		expect(await sourcesFor(foodId)).toEqual([{ label: 'banana', source: 'user' }]);
	});

	it('a user write promotes a machine-owned label', async () => {
		const { setFoodLabels } = await import('$lib/server/food-labels');
		await setFoodLabels(userId, foodId, ['banana'], 'llm');
		await setFoodLabels(userId, foodId, ['banana'], 'user');
		expect(await sourcesFor(foodId)).toEqual([{ label: 'banana', source: 'user' }]);
	});

	it('clearing a source removes exactly its rows', async () => {
		const { setFoodLabels } = await import('$lib/server/food-labels');
		await setFoodLabels(userId, foodId, ['banana'], 'llm');
		expect(await setFoodLabels(userId, foodId, [], 'llm')).toEqual([]);
		expect(await sourcesFor(foodId)).toEqual([]);
	});

	it('refuses a food the caller does not own', async () => {
		const { setFoodLabels } = await import('$lib/server/food-labels');
		expect(await setFoodLabels(otherUserId, foodId, ['banana'], 'llm')).toBeNull();
		expect(await sourcesFor(foodId)).toEqual([]);
	});

	it('reports per-item results for a batch and keeps going past a bad id', async () => {
		const { setFoodLabelsBatch } = await import('$lib/server/food-labels');
		const results = await setFoodLabelsBatch(
			userId,
			[
				{ foodId, labels: ['banana'] },
				{ foodId: '00000000-0000-0000-0000-000000000000', labels: ['ghost'] },
				{ foodId: otherFoodId, labels: ['bread'] }
			],
			'external'
		);
		expect(results.map((r) => r.ok)).toEqual([true, false, true]);
		expect(results[1].error).toBe('Food not found');
		expect(await sourcesFor(otherFoodId)).toEqual([{ label: 'bread', source: 'external' }]);
	});

	it('deleting a food takes its labels with it', async () => {
		const { setFoodLabels } = await import('$lib/server/food-labels');
		const db = getTestDB(dbUrl);
		await setFoodLabels(userId, foodId, ['banana'], 'llm');
		await db.delete(foods).where(eq(foods.id, foodId));
		expect(await sourcesFor(foodId)).toEqual([]);
	});
});

describe('labels on the food read shape', () => {
	it('getFood, listFoods and updateFood all return the flat array', async () => {
		const { setFoodLabels } = await import('$lib/server/food-labels');
		const { getFood, listFoods, updateFood, findFoodByBarcode } = await import('$lib/server/foods');
		await setFoodLabels(userId, foodId, ['fruit', 'banana'], 'llm');

		expect((await getFood(userId, foodId))?.labels).toEqual(['banana', 'fruit']);

		const { items } = await listFoods(userId);
		expect(items.find((f) => f.id === foodId)?.labels).toEqual(['banana', 'fruit']);
		expect(items.find((f) => f.id === otherFoodId)?.labels).toEqual([]);

		// The update response must carry them too, or a client that caches the
		// returned food silently drops its labels until the next full refresh.
		const updated = await updateFood(userId, foodId, { name: 'Banane (reif)' });
		expect(updated.success && updated.data?.labels).toEqual(['banana', 'fruit']);

		const db = getTestDB(dbUrl);
		await db.update(foods).set({ barcode: '4011200296908' }).where(eq(foods.id, foodId));
		expect((await findFoodByBarcode(userId, '4011200296908'))?.labels).toEqual(['banana', 'fruit']);
	});

	it('a newly created food comes back with an empty array', async () => {
		const { createFood } = await import('$lib/server/foods');
		const result = await createFood(userId, {
			name: 'Apfel',
			servingSize: 100,
			servingUnit: 'g',
			calories: 52,
			protein: 0.3,
			carbs: 14,
			fat: 0.2,
			fiber: 2.4
		});
		expect(result.success && result.data.labels).toEqual([]);
	});

	it('unlabeled=true returns only foods with no labels at all', async () => {
		const { setFoodLabels } = await import('$lib/server/food-labels');
		const { listFoods } = await import('$lib/server/foods');
		await setFoodLabels(userId, foodId, ['banana'], 'llm');

		const { items, total } = await listFoods(userId, { unlabeled: true });
		expect(items.map((f) => f.id)).toEqual([otherFoodId]);
		expect(total).toBe(1);
	});

	it('another user’s labels never leak onto a food', async () => {
		const { setFoodLabels } = await import('$lib/server/food-labels');
		const { getFood } = await import('$lib/server/foods');
		const db = getTestDB(dbUrl);
		await setFoodLabels(userId, foodId, ['banana'], 'llm');
		// Same food id is impossible across users (foods are per-user), so assert
		// the neighbouring case: the other user simply sees nothing.
		expect(await getFood(otherUserId, foodId)).toBeNull();
		await db
			.delete(foodLabels)
			.where(and(eq(foodLabels.userId, userId), eq(foodLabels.foodId, foodId)));
		expect((await getFood(userId, foodId))?.labels).toEqual([]);
	});
});
