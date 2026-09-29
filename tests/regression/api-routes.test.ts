import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createMockEvent } from '../helpers/mock-request-event';
import { TEST_USER, TEST_FOOD } from '../helpers/fixtures';

let mockBarcodeResult: unknown = null;
let mockDeleteResult: Record<string, unknown> = { blocked: false };
let mockDayProperties: unknown = null;
const setDayPropertiesCalls: unknown[][] = [];

vi.mock('$lib/server/foods', () => ({
	getFood: async () => null,
	updateFood: async () => null,
	deleteFood: async () => mockDeleteResult,
	listFoods: async () => ({ items: [], total: 0 }),
	findFoodByBarcode: async () => mockBarcodeResult,
	createFood: async () => ({ success: true, data: TEST_FOOD }),
	listRecentFoods: async () => [],
	toFoodInsert: () => ({}),
	toFoodUpdate: () => ({})
}));

vi.mock('$lib/server/day-properties', () => ({
	getDayProperties: async () => mockDayProperties,
	getDayPropertiesRange: async () => [],
	setDayProperties: async (...args: unknown[]) => {
		setDayPropertiesCalls.push(args);
		return mockDayProperties;
	},
	deleteDayProperties: async () => 'deleted'
}));

const foodsRoute = await import('../../src/routes/api/foods/+server');
const foodByIdRoute = await import('../../src/routes/api/foods/[id]/+server');
const legacyDayProps = await import('../../src/routes/api/day-properties/[date]/+server');

beforeEach(() => {
	mockBarcodeResult = null;
	mockDeleteResult = { blocked: false };
	mockDayProperties = null;
	setDayPropertiesCalls.length = 0;
});

describe('06fd5359 GET /api/foods?barcode= uses the { foods, total } list shape', () => {
	const request = () =>
		createMockEvent({
			user: TEST_USER,
			url: 'http://localhost/api/foods?barcode=1234567890123'
		});

	test('a hit is a one-element foods array, not a bare { food }', async () => {
		mockBarcodeResult = TEST_FOOD;
		const data = await (await foodsRoute.GET(request())).json();
		expect(data).not.toHaveProperty('food');
		expect(data.foods).toHaveLength(1);
		expect(data.foods[0].id).toBe(TEST_FOOD.id);
		expect(data.total).toBe(1);
	});

	test('a miss is an empty list with total 0, still 200', async () => {
		const response = await foodsRoute.GET(request());
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ foods: [], total: 0 });
	});

	test('a malformed barcode is a 400 with an error message', async () => {
		const response = await foodsRoute.GET(
			createMockEvent({ user: TEST_USER, url: 'http://localhost/api/foods?barcode=abc' })
		);
		expect(response.status).toBe(400);
		expect((await response.json()).error).toBe('Invalid barcode format');
	});
});

describe('2d500f8d DELETE /api/foods/{id} 409 forwards the recipe and ingredient counts', () => {
	test('entryCount, ingredientCount, recipeCount and supplementIngredientCount reach the client', async () => {
		mockDeleteResult = {
			blocked: true,
			entryCount: 2,
			ingredientCount: 3,
			recipeCount: 2,
			supplementIngredientCount: 1
		};
		const response = await foodByIdRoute.DELETE(
			createMockEvent({ user: TEST_USER, params: { id: TEST_FOOD.id }, method: 'DELETE' })
		);
		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({
			error: 'has_entries',
			entryCount: 2,
			ingredientCount: 3,
			recipeCount: 2,
			supplementIngredientCount: 1
		});
	});
});

describe('8575042b legacy /api/day-properties/<date> shim', () => {
	test('GET sources the date from the path', async () => {
		mockDayProperties = { date: '2026-06-28', isFastingDay: true };
		const response = await legacyDayProps.GET(
			createMockEvent({ user: TEST_USER, params: { date: '2026-06-28' } })
		);
		expect(response.status).toBe(200);
		expect((await response.json()).properties).toEqual(mockDayProperties);
	});

	test('GET rejects a malformed path date with 400 instead of throwing', async () => {
		const response = await legacyDayProps.GET(
			createMockEvent({ user: TEST_USER, params: { date: 'not-a-date' } })
		);
		expect(response.status).toBe(400);
	});

	test('GET without a session is 401', async () => {
		const response = await legacyDayProps.GET(
			createMockEvent({ user: null, params: { date: '2026-06-28' } })
		);
		expect(response.status).toBe(401);
	});

	test('PUT merges the path date into the body before saving', async () => {
		mockDayProperties = { date: '2026-06-28', isFastingDay: true };
		const response = await legacyDayProps.PUT(
			createMockEvent({
				user: TEST_USER,
				params: { date: '2026-06-28' },
				method: 'PUT',
				body: { isFastingDay: true }
			})
		);
		expect(response.status).toBe(200);
		expect(setDayPropertiesCalls[0]?.[1]).toBe('2026-06-28');
	});

	test('DELETE answers 204', async () => {
		const response = await legacyDayProps.DELETE(
			createMockEvent({ user: TEST_USER, params: { date: '2026-06-28' }, method: 'DELETE' })
		);
		expect(response.status).toBe(204);
	});
});
