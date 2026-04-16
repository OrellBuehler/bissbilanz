import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createMockDB } from '../helpers/mock-db';
import { TEST_USER, TEST_FOOD, TEST_FOOD_2 } from '../helpers/fixtures';
import type { foods as foodsTable } from '$lib/server/schema';

type Food = typeof foodsTable.$inferSelect;

const { db, setResult, reset } = createMockDB();

const schema = await import('$lib/server/schema');

vi.mock('$lib/server/db', () => ({
	getDB: () => db,
	...Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, value]))
}));

const { findDuplicateGroups, similarity } = await import('$lib/server/food-duplicates');

const FOOD_A = {
	...TEST_FOOD,
	id: '20000000-0000-4000-8000-000000000001',
	name: 'Greek Yogurt',
	brand: 'Brand A',
	barcode: '1111111111'
};
const FOOD_A_DUP_BARCODE = {
	...TEST_FOOD,
	id: '20000000-0000-4000-8000-000000000002',
	name: 'greek yoghurt', // similar to A, different spelling/case
	brand: 'Brand A',
	barcode: '1111111111'
};
const FOOD_BARCODE_BUT_UNRELATED = {
	...TEST_FOOD,
	id: '20000000-0000-4000-8000-000000000003',
	name: 'Bananas',
	brand: 'Other',
	barcode: '2222222222'
};
const FOOD_BARCODE_TYPO_DIFFERENT = {
	...TEST_FOOD,
	id: '20000000-0000-4000-8000-000000000004',
	name: 'Completely Different Item',
	brand: 'X',
	barcode: '2222222222'
};
const FOOD_NAME_BRAND_DUP_1 = {
	...TEST_FOOD_2,
	id: '20000000-0000-4000-8000-000000000010',
	name: 'Banana',
	brand: 'Generic',
	barcode: null
};
const FOOD_NAME_BRAND_DUP_2 = {
	...TEST_FOOD_2,
	id: '20000000-0000-4000-8000-000000000011',
	name: '  banana  ', // case/whitespace differences
	brand: 'GENERIC',
	barcode: null
};
const FOOD_NAME_DUP_BUT_DIFFERENT_BRAND = {
	...TEST_FOOD_2,
	id: '20000000-0000-4000-8000-000000000012',
	name: 'Banana',
	brand: 'OtherBrand',
	barcode: null
};
const FOOD_UNIQUE = {
	...TEST_FOOD,
	id: '20000000-0000-4000-8000-000000000020',
	name: 'Unique Food',
	brand: 'X',
	barcode: '9999999999'
};

describe('similarity', () => {
	test('identical strings return 1', () => {
		expect(similarity('hello', 'hello')).toBe(1);
	});

	test('case and whitespace differences score high', () => {
		expect(similarity('Hello', 'hello ')).toBeGreaterThan(0.9);
	});

	test('completely different strings score low', () => {
		expect(similarity('apple', 'xyzqwerty')).toBeLessThan(0.3);
	});

	test('similar but slightly different strings score above threshold', () => {
		expect(similarity('Greek Yogurt', 'greek yoghurt')).toBeGreaterThan(0.5);
	});
});

describe('findDuplicateGroups', () => {
	beforeEach(() => reset());

	test('returns empty when no duplicates', async () => {
		setResult([FOOD_A, FOOD_NAME_DUP_BUT_DIFFERENT_BRAND, FOOD_UNIQUE]);
		const groups = await findDuplicateGroups(TEST_USER.id);
		expect(groups).toEqual([]);
	});

	test('detects barcode duplicates with similar names', async () => {
		setResult([FOOD_A, FOOD_A_DUP_BARCODE, FOOD_UNIQUE]);
		const groups = await findDuplicateGroups(TEST_USER.id);
		const barcodeGroups = groups.filter((g) => g.reason === 'barcode');
		expect(barcodeGroups).toHaveLength(1);
		expect(barcodeGroups[0].foods.map((f) => f.id).sort()).toEqual(
			[FOOD_A.id, FOOD_A_DUP_BARCODE.id].sort()
		);
	});

	test('skips barcode collisions when names are too dissimilar', async () => {
		setResult([FOOD_BARCODE_BUT_UNRELATED, FOOD_BARCODE_TYPO_DIFFERENT]);
		const groups = await findDuplicateGroups(TEST_USER.id);
		expect(groups.filter((g) => g.reason === 'barcode')).toHaveLength(0);
	});

	test('detects name+brand duplicates after normalization', async () => {
		setResult([FOOD_NAME_BRAND_DUP_1, FOOD_NAME_BRAND_DUP_2, FOOD_UNIQUE]);
		const groups = await findDuplicateGroups(TEST_USER.id);
		const nameGroups = groups.filter((g) => g.reason === 'name_brand');
		expect(nameGroups).toHaveLength(1);
		expect(nameGroups[0].foods).toHaveLength(2);
	});

	test('does not group different brands with same name', async () => {
		setResult([FOOD_NAME_BRAND_DUP_1, FOOD_NAME_DUP_BUT_DIFFERENT_BRAND]);
		const groups = await findDuplicateGroups(TEST_USER.id);
		expect(groups.filter((g) => g.reason === 'name_brand')).toHaveLength(0);
	});

	test('a food can appear in multiple groups (barcode + name_brand)', async () => {
		const namedAndBarcoded = {
			...TEST_FOOD,
			id: '20000000-0000-4000-8000-000000000030',
			name: 'Greek Yogurt',
			brand: 'Brand A',
			barcode: '1111111111'
		};
		const sameBarcodeSimilarName = {
			...TEST_FOOD,
			id: '20000000-0000-4000-8000-000000000031',
			name: 'greek yoghurt',
			brand: 'Brand B',
			barcode: '1111111111'
		};
		const sameNameBrand = {
			...TEST_FOOD,
			id: '20000000-0000-4000-8000-000000000032',
			name: 'Greek Yogurt',
			brand: 'Brand A',
			barcode: null
		};
		setResult([namedAndBarcoded, sameBarcodeSimilarName, sameNameBrand]);
		const groups = await findDuplicateGroups(TEST_USER.id);
		expect(groups.filter((g) => g.reason === 'barcode')).toHaveLength(1);
		expect(groups.filter((g) => g.reason === 'name_brand')).toHaveLength(1);
	});

	test('ignores foods with empty name (defensive)', async () => {
		const blank = {
			...TEST_FOOD,
			id: '20000000-0000-4000-8000-000000000040',
			name: '',
			brand: null,
			barcode: null
		};
		const blank2 = {
			...TEST_FOOD,
			id: '20000000-0000-4000-8000-000000000041',
			name: '   ',
			brand: null,
			barcode: null
		};
		setResult([blank, blank2]);
		const groups = await findDuplicateGroups(TEST_USER.id);
		expect(groups).toHaveLength(0);
	});
});
