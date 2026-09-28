import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createMockEvent } from '../helpers/mock-request-event';
import { expectResponseContract } from '../helpers/contract';
import { TEST_USER, TEST_FOOD } from '../helpers/fixtures';

let mockSearchResults: unknown[] = [];
let mockBarcodeResult: unknown = null;
let mockInstantiateResult: any = null;

vi.mock('$lib/server/db', () => ({ getDB: () => ({}) }));

vi.mock('$lib/server/catalog/queries', () => ({
	catalogSearch: async () => mockSearchResults,
	catalogByBarcode: async () => mockBarcodeResult,
	instantiateCatalogFood: async () => mockInstantiateResult
}));

const { GET: SEARCH_GET } = await import('../../src/routes/api/catalog/search/+server');
const { GET: BARCODE_GET } = await import('../../src/routes/api/catalog/barcode/[code]/+server');
const { POST: SAVE_POST } = await import('../../src/routes/api/catalog/[id]/save/+server');

describe('api/catalog', () => {
	beforeEach(() => {
		mockSearchResults = [];
		mockBarcodeResult = null;
		mockInstantiateResult = null;
	});

	describe('GET /api/catalog/search', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({
				user: null,
				url: 'http://localhost/api/catalog/search?q=milk'
			});
			const response = await SEARCH_GET(event);
			await expectResponseContract('GET', '/api/catalog/search', response);
			expect(response.status).toBe(401);
		});

		test('returns results for a query', async () => {
			mockSearchResults = [{ name: 'Milk', barcode: '1234567890123' }];
			const event = createMockEvent({
				user: TEST_USER,
				url: 'http://localhost/api/catalog/search?q=milk'
			});
			const response = await SEARCH_GET(event);
			await expectResponseContract('GET', '/api/catalog/search', response);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.results).toHaveLength(1);
		});

		test('returns empty results for a short query', async () => {
			const event = createMockEvent({
				user: TEST_USER,
				url: 'http://localhost/api/catalog/search?q=m'
			});
			const response = await SEARCH_GET(event);
			await expectResponseContract('GET', '/api/catalog/search', response);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.results).toEqual([]);
		});
	});

	describe('GET /api/catalog/barcode/:code', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({ user: null, params: { code: '1234567890123' } });
			const response = await BARCODE_GET(event);
			await expectResponseContract('GET', '/api/catalog/barcode/{code}', response);
			expect(response.status).toBe(401);
		});

		test('returns 400 for an invalid barcode', async () => {
			const event = createMockEvent({ user: TEST_USER, params: { code: 'abc' } });
			const response = await BARCODE_GET(event);
			await expectResponseContract('GET', '/api/catalog/barcode/{code}', response);
			expect(response.status).toBe(400);
		});

		test('returns the catalog row when found', async () => {
			mockBarcodeResult = { name: 'Milk', barcode: '1234567890123' };
			const event = createMockEvent({ user: TEST_USER, params: { code: '1234567890123' } });
			const response = await BARCODE_GET(event);
			await expectResponseContract('GET', '/api/catalog/barcode/{code}', response);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.found).toBe(true);
		});

		test('returns 404 when not found', async () => {
			mockBarcodeResult = null;
			const event = createMockEvent({ user: TEST_USER, params: { code: '1234567890123' } });
			const response = await BARCODE_GET(event);
			await expectResponseContract('GET', '/api/catalog/barcode/{code}', response);
			expect(response.status).toBe(404);
		});
	});

	describe('POST /api/catalog/:id/save', () => {
		const CATALOG_ID = '10000000-0000-4000-8000-000000000099';

		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({ user: null, params: { id: CATALOG_ID } });
			const response = await SAVE_POST(event);
			await expectResponseContract('POST', '/api/catalog/{id}/save', response);
			expect(response.status).toBe(401);
		});

		test('instantiates a personal food from the catalog row', async () => {
			mockInstantiateResult = { success: true, data: TEST_FOOD };
			const event = createMockEvent({ user: TEST_USER, params: { id: CATALOG_ID } });
			const response = await SAVE_POST(event);
			await expectResponseContract('POST', '/api/catalog/{id}/save', response);
			const data = await response.json();
			expect(response.status).toBe(201);
			expect(data.food.id).toBe(TEST_FOOD.id);
		});

		test('returns 404 when the catalog row is not accessible', async () => {
			mockInstantiateResult = null;
			const event = createMockEvent({ user: TEST_USER, params: { id: CATALOG_ID } });
			const response = await SAVE_POST(event);
			await expectResponseContract('POST', '/api/catalog/{id}/save', response);
			expect(response.status).toBe(404);
		});
	});
});
