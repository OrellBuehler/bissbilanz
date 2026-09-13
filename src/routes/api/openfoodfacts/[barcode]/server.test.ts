import { describe, it, expect, vi } from 'vitest';

vi.mock('$lib/server/openfoodfacts', () => ({
	fetchProduct: vi.fn(async (barcode: string) =>
		barcode === '3760049790214'
			? { name: 'Pain De Mie Bio', brand: 'La Boulangère', barcode, calories: 268 }
			: null
	)
}));

import { GET } from './+server';

const call = (barcode: string) =>
	GET({
		locals: { user: { id: 'u1' } },
		params: { barcode }
	} as unknown as Parameters<typeof GET>[0]);

describe('GET /api/openfoodfacts/[barcode]', () => {
	// The OpenFoodFactsProduct schema marks `id` required and the generated
	// Kotlin/Swift decoders reject a product without it — omitting it broke
	// logging OFF search hits on both mobile apps (TestFlight 2026-09-13).
	it('returns the product with id mirroring the barcode', async () => {
		const res = await call('3760049790214');
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.product.id).toBe('3760049790214');
		expect(body.product.barcode).toBe('3760049790214');
		expect(body.product.name).toBe('Pain De Mie Bio');
	});

	it('404s for an unknown barcode', async () => {
		const res = await call('4000000000001');
		expect(res.status).toBe(404);
	});
});
