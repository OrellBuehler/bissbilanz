import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createMockEvent } from '../helpers/mock-request-event';
import { TEST_USER } from '../helpers/fixtures';

let mockSearchResults: any[] = [];

vi.mock('$lib/server/openfoodfacts', () => ({
	searchProducts: async () => mockSearchResults
}));

vi.mock('$lib/server/rate-limit', () => ({
	rateLimit: () => {}
}));

const { GET } = await import('../../src/routes/api/openfoodfacts/search/+server');

const eventFor = (q: string, user = TEST_USER) =>
	createMockEvent({ user, url: `http://localhost/api/openfoodfacts/search?q=${q}` });

describe('api/openfoodfacts/search', () => {
	beforeEach(() => {
		mockSearchResults = [];
	});

	test('returns 401 when not authenticated', async () => {
		const response = await GET(eventFor('milk', null as any));
		const data = await response.json();
		expect(response.status).toBe(401);
		expect(data.error).toBe('Unauthorized');
	});

	test('returns empty results for a query shorter than 2 chars', async () => {
		mockSearchResults = [{ name: 'should not appear', barcode: '3017620422003' }];
		const response = await GET(eventFor('a'));
		const data = await response.json();
		expect(response.status).toBe(200);
		expect(data.results).toEqual([]);
	});

	test('returns mapped results with id mirroring the barcode', async () => {
		mockSearchResults = [{ name: 'Nutella', brand: 'Ferrero', barcode: '3017620422003' }];
		const response = await GET(eventFor('nutella'));
		const data = await response.json();
		expect(response.status).toBe(200);
		expect(data.results).toHaveLength(1);
		expect(data.results[0].id).toBe('3017620422003');
		expect(data.results[0].name).toBe('Nutella');
	});

	test('drops products without a valid EAN/UPC barcode so every result is pickable', async () => {
		mockSearchResults = [
			{ name: 'Valid', barcode: '3017620422003' },
			{ name: 'No barcode', barcode: '' },
			{ name: 'Bad barcode', barcode: 'abc' }
		];
		const response = await GET(eventFor('test'));
		const data = await response.json();
		expect(data.results.map((r: any) => r.name)).toEqual(['Valid']);
	});
});
