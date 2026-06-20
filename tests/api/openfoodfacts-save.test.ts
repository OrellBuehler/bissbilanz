import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createMockEvent } from '../helpers/mock-request-event';
import { TEST_USER, TEST_FOOD } from '../helpers/fixtures';

let mockFindBarcodeResult: any = null;
let mockFetchProductResult: any = null;
let mockCreateResult: any = null;

vi.mock('$lib/server/foods', () => ({
	findFoodByBarcode: async () => mockFindBarcodeResult,
	createFood: async () =>
		mockCreateResult
			? { success: true, data: mockCreateResult }
			: { success: false, error: new Error('create failed') }
}));

vi.mock('$lib/server/openfoodfacts', () => ({
	fetchProduct: async () => mockFetchProductResult
}));

vi.mock('$lib/server/rate-limit', () => ({
	rateLimit: () => {}
}));

vi.mock('$lib/server/db', () => ({
	getDB: () => ({})
}));

const { POST } = await import('../../src/routes/api/openfoodfacts/[barcode]/save/+server');

const BARCODE = '3017620422003';

const eventFor = (barcode: string, user = TEST_USER) =>
	createMockEvent({ user, params: { barcode }, method: 'POST' });

describe('api/openfoodfacts/[barcode]/save', () => {
	beforeEach(() => {
		mockFindBarcodeResult = null;
		mockFetchProductResult = null;
		mockCreateResult = null;
	});

	test('returns 401 when not authenticated', async () => {
		const response = await POST(eventFor(BARCODE, null as any));
		expect(response.status).toBe(401);
	});

	test('returns 400 for an invalid barcode', async () => {
		const response = await POST(eventFor('123'));
		const data = await response.json();
		expect(response.status).toBe(400);
		expect(data.error).toBe('Invalid barcode format');
	});

	test('is idempotent: returns the existing food (200) instead of erroring', async () => {
		mockFindBarcodeResult = TEST_FOOD;
		const response = await POST(eventFor(BARCODE));
		const data = await response.json();
		expect(response.status).toBe(200);
		expect(data.food.id).toBe(TEST_FOOD.id);
	});

	test('returns 404 when the product is not on Open Food Facts', async () => {
		mockFindBarcodeResult = null;
		mockFetchProductResult = null;
		const response = await POST(eventFor(BARCODE));
		const data = await response.json();
		expect(response.status).toBe(404);
		expect(data.error).toBe('Product not found');
	});

	test('creates a personal food (201) from the OFF product', async () => {
		mockFindBarcodeResult = null;
		mockFetchProductResult = { name: 'Nutella', barcode: BARCODE, calories: 539 };
		mockCreateResult = { ...TEST_FOOD, name: 'Nutella', barcode: BARCODE };
		const response = await POST(eventFor(BARCODE));
		const data = await response.json();
		expect(response.status).toBe(201);
		expect(data.food.name).toBe('Nutella');
	});
});
