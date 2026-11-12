import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({
	fdc: { apiKey: 'fdc-test-key' as string | undefined },
	captureException: vi.fn(),
	addBreadcrumb: vi.fn()
}));

vi.mock('$lib/server/env', () => ({ config: { fdc: h.fdc } }));
vi.mock('@sentry/sveltekit', () => ({
	captureException: h.captureException,
	addBreadcrumb: h.addBreadcrumb
}));

const fdc = await import('$lib/server/fooddata-central');
const { ALL_NUTRIENT_KEYS } = await import('$lib/nutrients');

const fixture = (name: string) =>
	JSON.parse(readFileSync(join(__dirname, '../fixtures/fdc', name), 'utf8'));
const SEARCH = fixture('search-pear-raw.json');
const SR_LEGACY = fixture('food-169118-sr-legacy.json');
const FOUNDATION = fixture('food-746773-foundation.json');
const SURVEY = fixture('food-2709254-survey.json');

let fetchSpy: ReturnType<typeof vi.spyOn>;
let user = 0;
const nextUser = () => `user-${++user}`;

beforeEach(() => {
	h.fdc.apiKey = 'fdc-test-key';
	h.captureException.mockReset();
	h.addBreadcrumb.mockReset();
	fdc.resetFdcCacheForTests();
	fetchSpy = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
	fetchSpy.mockRestore();
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('nutrient mapping', () => {
	test('maps only catalog keys and leaves the omega sums out', () => {
		const keys = Object.keys(fdc.FDC_NUTRIENT_IDS);
		expect(keys.every((key) => ALL_NUTRIENT_KEYS.includes(key))).toBe(true);
		expect(ALL_NUTRIENT_KEYS.filter((key) => !keys.includes(key))).toEqual(['omega3', 'omega6']);
	});

	test('maps an SR Legacy record from the full details format', () => {
		const food = fdc.toFdcFood(SR_LEGACY);
		expect(food).toMatchObject({
			fdcId: 169118,
			description: 'Pears, raw',
			dataType: 'SR Legacy',
			per100g: { calories: 57, protein: 0.36, carbs: 15.23, fat: 0.14, fiber: 3.1 }
		});
		expect(food.nutrients).toMatchObject({
			vitaminC: 4.3,
			potassium: 116,
			calcium: 9,
			vitaminK: 4.4,
			vitaminA: 1,
			vitaminB9: 7,
			selenium: 0.1,
			sugar: 9.75,
			water: 83.96,
			fluoride: 0.0022,
			caffeine: 0,
			alcohol: 0
		});
		expect(food.nutrients).not.toHaveProperty('omega3');
		expect(Object.keys(food.nutrients)).toHaveLength(32);
	});

	test('takes Foundation sugar from 1063 and skips rows without an amount', () => {
		const food = fdc.toFdcFood(FOUNDATION);
		expect(food.dataType).toBe('Foundation');
		expect(food.per100g.calories).toBe(57);
		expect(food.nutrients.sugar).toBe(9.69);
		expect(food.nutrients.sodium).toBe(7);
		expect(Object.values(food.nutrients).every((value) => Number.isFinite(value))).toBe(true);
	});

	test('maps a Survey (FNDDS) record', () => {
		const food = fdc.toFdcFood(SURVEY);
		expect(food).toMatchObject({ fdcId: 2709254, dataType: 'Survey (FNDDS)' });
		expect(food.per100g.calories).toBe(59);
		expect(food.nutrients.vitaminC).toBeGreaterThan(0);
	});

	test('falls back to the Atwater energy when the record has no 1008 energy', () => {
		const food = fdc.toFdcFood({
			fdcId: 1,
			description: 'Beans, raw',
			dataType: 'Foundation',
			foodNutrients: [
				{ nutrient: { id: 1062, unitName: 'kJ' }, amount: 1400 },
				{ nutrient: { id: 2047, unitName: 'kcal' }, amount: 330 },
				{ nutrient: { id: 2048, unitName: 'kcal' }, amount: 333 }
			]
		});
		expect(food.per100g.calories).toBe(333);
		expect(food.per100g.protein).toBeNull();
	});

	test('maps the search format with upper-case units', () => {
		const food = fdc.toFdcFood(
			SEARCH.foods.find((item: { fdcId: number }) => item.fdcId === 169118)
		);
		expect(food.per100g.calories).toBe(57);
		expect(food.nutrients.vitaminC).toBe(4.3);
		expect(food.nutrients.selenium).toBe(0.1);
	});

	test.each([
		[1, 'G', 'mg', 1000],
		[250, 'MG', 'g', 0.25],
		[22, 'UG', 'mg', 0.022],
		[3, 'µg', 'µg', 3],
		[3, 'μg', 'µg', 3],
		[3, 'mcg', 'µg', 3]
	] as const)('converts %s %s to %s', (amount, from, to, expected) => {
		expect(fdc.convertNutrientAmount(amount, from, to)).toBe(expected);
	});

	test.each([
		[28, 'IU'],
		[57, 'KCAL'],
		[-1, 'MG'],
		[Number.NaN, 'MG']
	])('does not convert %s %s', (amount, from) => {
		expect(fdc.convertNutrientAmount(amount, from, 'mg')).toBeNull();
	});
});

describe('serving scale', () => {
	test.each([
		[178, 'g', 1.78],
		[0.2, 'kg', 2],
		[1, 'oz', 0.28349523125],
		[1, 'lb', 4.5359237]
	] as const)('scales %s %s', (size, unit, expected) => {
		expect(fdc.fdcServingScale(size, unit)).toBeCloseTo(expected, 9);
	});

	test.each(['ml', 'cl', 'l', 'fl_oz', 'cup', 'tbsp', 'tsp'] as const)(
		'has no reliable weight for %s',
		(unit) => {
			expect(fdc.fdcServingScale(250, unit)).toBeNull();
		}
	);

	test('rejects a non-positive serving', () => {
		expect(fdc.fdcServingScale(0, 'g')).toBeNull();
	});

	test('scales every nutrient and rounds to four places', () => {
		const food = fdc.toFdcFood(SR_LEGACY);
		const scaled = fdc.scaleFdcNutrients(food, 1.78);
		expect(scaled.vitaminC).toBe(7.654);
		expect(scaled.potassium).toBe(206.48);
		expect(scaled.fluoride).toBe(0.0039);
		expect(Object.keys(scaled)).toEqual(Object.keys(food.nutrients));
	});
});

describe('searchFdcFoods', () => {
	test('posts the query with the key in a header and ranks Foundation and SR Legacy first', async () => {
		fetchSpy.mockResolvedValueOnce(json(SEARCH));
		const foods = await fdc.searchFdcFoods(nextUser(), '  pear raw ');
		const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('https://api.nal.usda.gov/fdc/v1/foods/search');
		expect(url).not.toContain('api_key');
		expect(init.method).toBe('POST');
		expect(new Headers(init.headers).get('x-api-key')).toBe('fdc-test-key');
		expect(JSON.parse(String(init.body))).toEqual({
			query: 'pear raw',
			dataType: ['Foundation', 'SR Legacy', 'Survey (FNDDS)'],
			pageSize: 10
		});
		expect(init.signal).toBeInstanceOf(AbortSignal);
		expect(foods.map((food) => [food.fdcId, food.dataType])).toEqual([
			[169118, 'SR Legacy'],
			[168177, 'SR Legacy'],
			[746773, 'Foundation'],
			[167750, 'SR Legacy'],
			[2709254, 'Survey (FNDDS)'],
			[2709255, 'Survey (FNDDS)']
		]);
	});

	test('caches searches and the records they return', async () => {
		fetchSpy.mockResolvedValueOnce(json(SEARCH));
		const userId = nextUser();
		await fdc.searchFdcFoods(userId, 'pear raw');
		await fdc.searchFdcFoods(userId, 'Pear Raw');
		const record = await fdc.getFdcFood(userId, 169118);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(record.nutrients.vitaminC).toBe(4.3);
	});

	test('asks again once a cached search is an hour old', async () => {
		fetchSpy.mockImplementation(async () => json(SEARCH));
		const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
		const userId = nextUser();
		await fdc.searchFdcFoods(userId, 'pear raw');
		now.mockReturnValue(1_000_000 + 59 * 60_000);
		await fdc.searchFdcFoods(userId, 'pear raw');
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		now.mockReturnValue(1_000_000 + 60 * 60_000);
		await fdc.searchFdcFoods(userId, 'pear raw');
		expect(fetchSpy).toHaveBeenCalledTimes(2);
		now.mockRestore();
	});

	test('drops data types it does not use', async () => {
		fetchSpy.mockResolvedValueOnce(
			json({
				foods: [
					{ ...SEARCH.foods[0], fdcId: 1, dataType: 'Branded' },
					{ ...SEARCH.foods[1], fdcId: 2 }
				]
			})
		);
		const foods = await fdc.searchFdcFoods(nextUser(), 'pear');
		expect(foods.map((food) => food.fdcId)).toEqual([2]);
	});

	test('returns an empty list when nothing matches', async () => {
		fetchSpy.mockResolvedValueOnce(json({ totalHits: 0, foods: [] }));
		expect(await fdc.searchFdcFoods(nextUser(), 'zzz')).toEqual([]);
	});
});

describe('getFdcFood', () => {
	test('fetches the full record by id with the key in a header', async () => {
		fetchSpy.mockResolvedValueOnce(json(FOUNDATION));
		const userId = nextUser();
		const food = await fdc.getFdcFood(userId, 746773);
		const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('https://api.nal.usda.gov/fdc/v1/food/746773');
		expect(init.method).toBe('GET');
		expect(init.body).toBeUndefined();
		expect(new Headers(init.headers).get('x-api-key')).toBe('fdc-test-key');
		expect(food.description).toBe('Pears, raw, bartlett');
		await fdc.getFdcFood(userId, 746773);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	test('names an unknown record', async () => {
		fetchSpy.mockResolvedValueOnce(new Response('', { status: 404 }));
		await expect(fdc.getFdcFood(nextUser(), 999999999)).rejects.toThrow(
			'FoodData Central has no record 999999999.'
		);
		expect(h.captureException).not.toHaveBeenCalled();
	});

	test('refuses Branded records', async () => {
		fetchSpy.mockResolvedValueOnce(json({ ...SR_LEGACY, fdcId: 5, dataType: 'Branded' }));
		await expect(fdc.getFdcFood(nextUser(), 5)).rejects.toBeInstanceOf(fdc.NutrientDatabaseError);
	});
});

describe('failures', () => {
	test('without a key nothing is requested', async () => {
		h.fdc.apiKey = undefined;
		expect(fdc.isFdcConfigured()).toBe(false);
		await expect(fdc.searchFdcFoods(nextUser(), 'pear')).rejects.toThrow('not configured');
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	test('reports configuration as present with a key', () => {
		expect(fdc.isFdcConfigured()).toBe(true);
	});

	test('a timeout or network failure is a breadcrumb and a tool-safe error', async () => {
		fetchSpy.mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'));
		await expect(fdc.searchFdcFoods(nextUser(), 'pear')).rejects.toBeInstanceOf(
			fdc.NutrientDatabaseError
		);
		expect(h.addBreadcrumb).toHaveBeenCalledWith(
			expect.objectContaining({
				category: 'fdc',
				data: expect.objectContaining({ reason: 'TimeoutError' })
			})
		);
		expect(h.captureException).not.toHaveBeenCalled();
	});

	test.each([429, 500, 503])('an answer of %s is a breadcrumb', async (status) => {
		fetchSpy.mockResolvedValueOnce(new Response('', { status }));
		await expect(fdc.searchFdcFoods(nextUser(), 'pear')).rejects.toBeInstanceOf(
			fdc.NutrientDatabaseError
		);
		expect(h.addBreadcrumb).toHaveBeenCalledWith(
			expect.objectContaining({ data: expect.objectContaining({ status }) })
		);
		expect(h.captureException).not.toHaveBeenCalled();
	});

	test('a rejected key is reported', async () => {
		fetchSpy.mockResolvedValueOnce(new Response('', { status: 403 }));
		await expect(fdc.getFdcFood(nextUser(), 1)).rejects.toBeInstanceOf(fdc.NutrientDatabaseError);
		expect(h.captureException).toHaveBeenCalledTimes(1);
	});

	test('an unexpected shape or broken JSON is reported', async () => {
		fetchSpy.mockResolvedValueOnce(json({ foods: [{ fdcId: 'x' }] }));
		await expect(fdc.searchFdcFoods(nextUser(), 'pear')).rejects.toBeInstanceOf(
			fdc.NutrientDatabaseError
		);
		fetchSpy.mockResolvedValueOnce(new Response('<html>', { status: 200 }));
		await expect(fdc.getFdcFood(nextUser(), 1)).rejects.toBeInstanceOf(fdc.NutrientDatabaseError);
		expect(h.captureException).toHaveBeenCalledTimes(2);
	});

	test('throttles each user and leaves only a breadcrumb', async () => {
		fetchSpy.mockImplementation(async () => json({ foods: [] }));
		const userId = nextUser();
		for (let index = 0; index < 60; index++) await fdc.searchFdcFoods(userId, `food ${index}`);
		await expect(fdc.searchFdcFoods(userId, 'one more')).rejects.toThrow('Too many');
		expect(fetchSpy).toHaveBeenCalledTimes(60);
		expect(h.addBreadcrumb).toHaveBeenCalledWith(
			expect.objectContaining({ category: 'rate-limit' })
		);
		expect(h.captureException).not.toHaveBeenCalled();
		await expect(fdc.searchFdcFoods(nextUser(), 'other user')).resolves.toEqual([]);
	});
});
