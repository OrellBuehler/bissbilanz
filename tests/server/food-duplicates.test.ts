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

const { findDuplicateGroups, similarity, macrosSimilar, groupBySimilarNameAndMacros } =
	await import('$lib/server/food-duplicates');

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

	test('is diacritics-insensitive', () => {
		expect(similarity('Müller Reis', 'Muller Reis')).toBe(1);
		expect(similarity('Käse', 'Kase')).toBe(1);
	});
});

describe('macrosSimilar', () => {
	const grams = (overrides: Partial<Parameters<typeof macrosSimilar>[0]> = {}) => ({
		servingSize: 100,
		servingUnit: 'g' as const,
		calories: 60,
		protein: 10,
		carbs: 4,
		fat: 0,
		...overrides
	});

	test('matches identical per-serving macros', () => {
		expect(macrosSimilar(grams(), grams())).toBe(true);
	});

	test('matches the same product at a different serving size', () => {
		const a = grams({ servingSize: 100, calories: 60, protein: 10, carbs: 4, fat: 0 });
		const b = grams({ servingSize: 30, calories: 18, protein: 3, carbs: 1.2, fat: 0 });
		expect(macrosSimilar(a, b)).toBe(true);
	});

	test('rejects meaningfully different macros', () => {
		expect(
			macrosSimilar(grams({ calories: 60, protein: 10 }), grams({ calories: 250, protein: 2 }))
		).toBe(false);
	});

	test('rejects mismatched unit dimensions (mass vs. volume)', () => {
		expect(macrosSimilar(grams({ servingUnit: 'g' }), grams({ servingUnit: 'ml' }))).toBe(false);
	});
});

describe('groupBySimilarNameAndMacros', () => {
	const row = (
		id: string,
		name: string,
		overrides: Partial<Parameters<typeof groupBySimilarNameAndMacros>[0][number]> = {}
	) => ({
		id,
		name,
		brand: null,
		barcode: null,
		servingSize: 100,
		servingUnit: 'g' as const,
		calories: 60,
		protein: 10,
		carbs: 4,
		fat: 0,
		...overrides
	});

	test('clusters foods with near-identical names and macros', () => {
		const rows = [
			row('a', 'Greek Yogurt'),
			row('b', 'Greek Yoghurt'),
			row('c', 'Chicken Breast', { calories: 165, protein: 31, carbs: 0, fat: 3.6 })
		];
		const groups = groupBySimilarNameAndMacros(rows);
		expect(groups).toHaveLength(1);
		expect(groups[0].reason).toBe('similar');
		expect(groups[0].foods.map((f) => f.id).sort()).toEqual(['a', 'b']);
	});

	test('does not group similar names with different macros', () => {
		const rows = [
			row('a', 'Greek Yogurt', { calories: 60, protein: 10 }),
			row('b', 'Greek Yogurt', { calories: 250, protein: 2 })
		];
		expect(groupBySimilarNameAndMacros(rows)).toHaveLength(0);
	});

	test('ignores blank names (defensive)', () => {
		const rows = [row('a', ''), row('b', '   ')];
		expect(groupBySimilarNameAndMacros(rows)).toHaveLength(0);
	});

	const seeded = (seed: number) => () => {
		seed = (seed * 1664525 + 1013904223) % 4294967296;
		return seed / 4294967296;
	};

	const WORDS = [
		'greek',
		'yogurt',
		'oat',
		'milk',
		'apple',
		'juice',
		'bread',
		'rye',
		'cheese',
		'tofu'
	];

	const randomRows = (count: number, random: () => number) =>
		Array.from({ length: count }, (_, index) => {
			const words = 1 + Math.floor(random() * 3);
			let name = Array.from(
				{ length: words },
				() => WORDS[Math.floor(random() * WORDS.length)]
			).join(' ');
			if (random() < 0.3) name = name.slice(1);
			if (random() < 0.2) name = `${name}s`;
			const pick = random();
			const scale = pick < 0.15 ? 0 : pick < 0.3 ? 0.4 : pick < 0.5 ? 0.5 : 1 + random() * 4;
			const jitter = () => 1 + (random() - 0.5) * 0.25;
			return row(`id-${String(index).padStart(5, '0')}`, name, {
				servingSize: random() < 0.5 ? 100 : 30 + Math.floor(random() * 3) * 10,
				servingUnit: random() < 0.8 ? ('g' as const) : ('ml' as const),
				calories: scale * 100 * jitter(),
				protein: scale * 10 * jitter(),
				carbs: scale * 20 * jitter(),
				fat: (random() < 0.3 ? 0 : scale) * 5 * jitter()
			});
		});

	const bruteForce = (rows: ReturnType<typeof randomRows>) => {
		const parent = new Map<string, string>();
		const find = (id: string): string => {
			const p = parent.get(id) ?? id;
			if (p === id) return id;
			const root = find(p);
			parent.set(id, root);
			return root;
		};
		for (let i = 0; i < rows.length; i++) {
			for (let j = i + 1; j < rows.length; j++) {
				if (similarity(rows[i].name, rows[j].name) < 0.82) continue;
				if (!macrosSimilar(rows[i], rows[j])) continue;
				parent.set(find(rows[i].id), find(rows[j].id));
			}
		}
		const clusters = new Map<string, string[]>();
		for (const r of rows) {
			const root = find(r.id);
			clusters.set(root, [...(clusters.get(root) ?? []), r.id]);
		}
		return [...clusters.values()].filter((ids) => ids.length > 1).map((ids) => ids.sort());
	};

	test.each([1, 2, 3])('finds exactly the clusters of the pairwise scan (seed %i)', (seed) => {
		const rows = randomRows(400, seeded(seed));
		const expected = bruteForce(rows)
			.map((ids) => ids.join(','))
			.sort();
		const actual = groupBySimilarNameAndMacros(rows)
			.map((group) => group.key)
			.sort();
		expect(expected.length).toBeGreaterThan(0);
		expect(actual).toEqual(expected);
	});

	test('scans 20k foods well inside the time budget', () => {
		const rows = randomRows(20000, seeded(7));
		const started = performance.now();
		const groups = groupBySimilarNameAndMacros(rows);
		expect(performance.now() - started).toBeLessThan(10000);
		expect(groups.length).toBeGreaterThan(0);
	}, 30000);

	test('stops at the time budget and returns what it found so far', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const rows = randomRows(2000, seeded(5));
		const groups = groupBySimilarNameAndMacros(rows, { budgetMs: -1 });
		expect(groups).toEqual([]);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('scan stopped'));
		warn.mockRestore();
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

	test('detects name+brand duplicates across diacritics', async () => {
		const withDiacritics = {
			...TEST_FOOD,
			id: '20000000-0000-4000-8000-000000000050',
			name: 'Müller Reis',
			brand: 'Müller',
			barcode: null
		};
		const withoutDiacritics = {
			...TEST_FOOD,
			id: '20000000-0000-4000-8000-000000000051',
			name: 'Muller Reis',
			brand: 'muller',
			barcode: null
		};
		setResult([withDiacritics, withoutDiacritics]);
		const groups = await findDuplicateGroups(TEST_USER.id);
		const nameGroups = groups.filter((g) => g.reason === 'name_brand');
		expect(nameGroups).toHaveLength(1);
		expect(nameGroups[0].foods).toHaveLength(2);
	});

	test('detects similar-name/similar-macro duplicates that share no barcode or exact name+brand', async () => {
		const a = {
			...TEST_FOOD,
			id: '20000000-0000-4000-8000-000000000060',
			name: 'Chicken Breast',
			brand: null,
			barcode: null,
			calories: 165,
			protein: 31,
			carbs: 0,
			fat: 3.6
		};
		const b = {
			...TEST_FOOD,
			id: '20000000-0000-4000-8000-000000000061',
			name: 'Chicken Breasts',
			brand: null,
			barcode: null,
			calories: 166,
			protein: 31.2,
			carbs: 0,
			fat: 3.5
		};
		setResult([a, b, FOOD_UNIQUE]);
		const groups = await findDuplicateGroups(TEST_USER.id);
		const similarGroups = groups.filter((g) => g.reason === 'similar');
		expect(similarGroups).toHaveLength(1);
		expect(similarGroups[0].foods.map((f) => f.id).sort()).toEqual([a.id, b.id].sort());
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
