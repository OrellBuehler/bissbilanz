import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ZodError } from 'zod';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { createMockDB } from '../helpers/mock-db';
import { TEST_FOOD, TEST_USER } from '../helpers/fixtures';
import type { OFFProduct } from '$lib/server/openfoodfacts';

const { db, queueResults, reset, getCalls } = createMockDB();

const h = vi.hoisted(() => ({
	updateFood: vi.fn(),
	seedCatalogLabels: vi.fn(),
	lookupProduct: vi.fn()
}));

vi.mock('$lib/server/db', () => ({ getDB: () => db }));
vi.mock('$lib/server/foods', () => ({ updateFood: h.updateFood }));
vi.mock('$lib/server/food-labels', () => ({
	foodColumnsWithLabels: {},
	seedCatalogLabels: h.seedCatalogLabels
}));
vi.mock('$lib/server/openfoodfacts', () => ({ lookupProduct: h.lookupProduct }));

const { applyLookup, enrichFood, lookupBarcode } =
	await import('$lib/server/food-enrichment/enrich');

const render = (value: SQL) => new PgDialect().sqlToQuery(value);

const BARCODE = '4000000000000';

const product = (overrides: Partial<OFFProduct> = {}): OFFProduct => ({
	name: 'Product',
	brand: 'Brand',
	servingSize: 100,
	servingUnit: 'g',
	calories: 400,
	protein: 10,
	carbs: 60,
	fat: 10,
	fiber: 8,
	nutriScore: 'b',
	novaGroup: 2,
	additives: [],
	ingredientsText: 'Oats',
	imageUrl: null,
	categoriesTags: [],
	barcode: BARCODE,
	...overrides
});

const stored = (overrides: Record<string, unknown> = {}) => ({
	...TEST_FOOD,
	barcode: BARCODE,
	nutriScore: null,
	novaGroup: null,
	ingredientsText: null,
	labels: [],
	version: '2026-11-11 10:00:00.123456+00',
	...overrides
});

const setCalls = () => getCalls().filter((call) => call.method === 'set');
const whereCalls = () => getCalls().filter((call) => call.method === 'where');

beforeEach(() => {
	reset();
	h.updateFood.mockReset();
	h.seedCatalogLabels.mockReset();
	h.lookupProduct.mockReset();
});

describe('lookupBarcode', () => {
	test('answers not found for an invalid barcode without a request', async () => {
		expect(await lookupBarcode('abc')).toEqual({ status: 'not_found' });
		expect(h.lookupProduct).not.toHaveBeenCalled();
	});

	test('looks up the trimmed barcode', async () => {
		h.lookupProduct.mockResolvedValue({ status: 'not_found' });
		await lookupBarcode(` ${BARCODE} `);
		expect(h.lookupProduct).toHaveBeenCalledWith(BARCODE);
	});
});

describe('applyLookup', () => {
	test('not found stamps the marker without touching updatedAt', async () => {
		queueResults([[stored({ offCheckedAt: new Date() })]]);

		const outcome = await applyLookup(TEST_USER.id, TEST_FOOD.id, `${BARCODE}\u00a0\t`, {
			status: 'not_found'
		});

		expect(outcome.status).toBe('not_found');
		expect(setCalls()).toHaveLength(1);
		const values = setCalls()[0].args[0];
		expect(Object.keys(values)).toEqual(['offCheckedAt']);
		expect(values.offCheckedAt).toBeInstanceOf(Date);
		const guard = render(whereCalls()[0].args[0]);
		expect(guard.sql).toContain('"foods"."barcode" = $3');
		expect(guard.params).toContain(`${BARCODE}\u00a0\t`);
	});

	test('not found on a food that was deleted is gone', async () => {
		queueResults([[], []]);
		expect(await applyLookup(TEST_USER.id, TEST_FOOD.id, BARCODE, { status: 'not_found' })).toEqual(
			{ status: 'gone' }
		);
	});

	test('not found on a food whose barcode changed is skipped', async () => {
		queueResults([[], [stored({ barcode: '5000000000000' })]]);
		expect(await applyLookup(TEST_USER.id, TEST_FOOD.id, BARCODE, { status: 'not_found' })).toEqual(
			{ status: 'skipped' }
		);
	});

	test('a found product with new data goes through updateFood with the guard', async () => {
		const updated = stored({ nutriScore: 'b' });
		queueResults([[stored()]]);
		h.updateFood.mockResolvedValue({ success: true, data: updated });

		const outcome = await applyLookup(TEST_USER.id, TEST_FOOD.id, BARCODE, {
			status: 'found',
			product: product({ categoriesTags: ['en:cereals'] })
		});

		expect(outcome).toEqual({ status: 'updated', food: updated });
		const [userId, foodId, payload, clientEditedAt, server] = h.updateFood.mock.calls[0];
		expect([userId, foodId, clientEditedAt]).toEqual([TEST_USER.id, TEST_FOOD.id, null]);
		expect(payload).toEqual({
			nutriScore: 'b',
			novaGroup: 2,
			ingredientsText: 'Oats',
			categoriesTags: ['en:cereals']
		});
		expect(server.offCheckedAt).toBeInstanceOf(Date);
		expect(server.keepUpdatedAt).toBe(true);
		const guard = render(server.where);
		expect(guard.sql).toBe('"foods"."server_modified_at" = $1::timestamptz');
		expect(guard.params).toEqual(['2026-11-11 10:00:00.123456+00']);
	});

	test('rereads and retries when the food changed in between', async () => {
		const updated = stored({ nutriScore: 'b' });
		queueResults([[stored()], [stored({ version: 'v2' })]]);
		h.updateFood
			.mockResolvedValueOnce({ success: true, data: undefined })
			.mockResolvedValueOnce({ success: true, data: updated });

		const outcome = await applyLookup(TEST_USER.id, TEST_FOOD.id, BARCODE, {
			status: 'found',
			product: product()
		});

		expect(outcome.status).toBe('updated');
		expect(render(h.updateFood.mock.calls[1][4].where).params).toEqual(['v2']);
	});

	test('gives up after repeated concurrent edits', async () => {
		queueResults([[stored()], [stored()], [stored()]]);
		h.updateFood.mockResolvedValue({ success: true, data: undefined });

		expect(
			await applyLookup(TEST_USER.id, TEST_FOOD.id, BARCODE, {
				status: 'found',
				product: product()
			})
		).toEqual({ status: 'skipped' });
		expect(h.updateFood).toHaveBeenCalledTimes(3);
	});

	test('matches the stored barcode exactly, whitespace included', async () => {
		const raw = `${BARCODE}\u00a0`;
		const updated = stored({ barcode: raw, nutriScore: 'b' });
		queueResults([[stored({ barcode: raw })]]);
		h.updateFood.mockResolvedValue({ success: true, data: updated });

		const outcome = await applyLookup(TEST_USER.id, TEST_FOOD.id, raw, {
			status: 'found',
			product: product()
		});

		expect(outcome.status).toBe('updated');
	});

	test('a deleted food is gone, one with another barcode is skipped', async () => {
		queueResults([[]]);
		expect(
			await applyLookup(TEST_USER.id, TEST_FOOD.id, BARCODE, {
				status: 'found',
				product: product()
			})
		).toEqual({ status: 'gone' });

		queueResults([[stored({ barcode: '5000000000000' })]]);
		expect(
			await applyLookup(TEST_USER.id, TEST_FOOD.id, BARCODE, {
				status: 'found',
				product: product()
			})
		).toEqual({ status: 'skipped' });
		expect(h.updateFood).not.toHaveBeenCalled();
	});

	test('nothing new only stamps the marker', async () => {
		const current = stored({ nutriScore: 'b', novaGroup: 2, ingredientsText: 'Oats' });
		queueResults([[current], [current]]);

		const outcome = await applyLookup(TEST_USER.id, TEST_FOOD.id, BARCODE, {
			status: 'found',
			product: product()
		});

		expect(outcome.status).toBe('unchanged');
		expect(h.updateFood).not.toHaveBeenCalled();
		expect(h.seedCatalogLabels).not.toHaveBeenCalled();
		expect(Object.keys(setCalls()[0].args[0])).toEqual(['offCheckedAt']);
	});

	test('nothing new but seeded labels counts as updated', async () => {
		const current = stored({ nutriScore: 'b', novaGroup: 2, ingredientsText: 'Oats' });
		queueResults([[current], [], [current], [current]]);
		h.seedCatalogLabels.mockResolvedValueOnce(['cereal']).mockResolvedValueOnce([]);

		const outcome = await applyLookup(TEST_USER.id, TEST_FOOD.id, BARCODE, {
			status: 'found',
			product: product({ categoriesTags: ['en:cereals'] })
		});

		expect(outcome.status).toBe('updated');
		expect(h.seedCatalogLabels).toHaveBeenCalledTimes(2);
		expect(h.seedCatalogLabels.mock.calls[0].slice(1)).toEqual([
			TEST_USER.id,
			TEST_FOOD.id,
			['en:cereals']
		]);
	});

	test('a rejected payload surfaces as an error', async () => {
		queueResults([[stored()]]);
		h.updateFood.mockResolvedValue({ success: false, error: new ZodError([]) });

		await expect(
			applyLookup(TEST_USER.id, TEST_FOOD.id, BARCODE, { status: 'found', product: product() })
		).rejects.toThrow('Validation failed');
	});
});

describe('enrichFood', () => {
	test('returns a transient failure without writing', async () => {
		const unavailable = {
			status: 'unavailable',
			httpStatus: 503,
			retryAfterSeconds: null,
			error: null
		};
		h.lookupProduct.mockResolvedValue(unavailable);

		expect(await enrichFood(TEST_USER.id, TEST_FOOD.id, BARCODE)).toEqual(unavailable);
		expect(getCalls()).toEqual([]);
	});

	test('returns an unreadable product without writing', async () => {
		const invalid = { status: 'invalid', issues: ['(root): invalid_type'] };
		h.lookupProduct.mockResolvedValue(invalid);

		expect(await enrichFood(TEST_USER.id, TEST_FOOD.id, BARCODE)).toEqual(invalid);
		expect(getCalls()).toEqual([]);
	});

	test('applies a definite answer', async () => {
		h.lookupProduct.mockResolvedValue({ status: 'not_found' });
		queueResults([[stored()]]);

		expect((await enrichFood(TEST_USER.id, TEST_FOOD.id, BARCODE)).status).toBe('not_found');
	});
});
