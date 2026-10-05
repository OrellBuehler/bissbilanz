import { test, expect } from 'bun:test';
import { join } from 'node:path';
import {
	createMigrosClient,
	mapNutrition,
	mapProductDetail,
	parseEnergyKcal,
	type MigrosApi
} from './client';

const ROOTS = { '7494733': 'Brot & Backwaren', '7494731': 'Milchprodukte & Eier' };

async function fixture() {
	return Bun.file(join(import.meta.dir, '../../fixtures/migros-product-detail.json')).json();
}

test('mapProductDetail reduces a real Migros product-detail to MigrosProductDetail', async () => {
	const d = mapProductDetail(await fixture(), ROOTS);
	expect(d).not.toBeNull();
	expect(d!.id).toBe('100005309');
	expect(d!.name).toBe('Müesli Schokolade');
	expect(d!.brand).toBe('Farmer Classic');
	expect(d!.gtins).toEqual(['7613312519127', '7610200085047']);
	expect(d!.productUrl).toBe('https://www.migros.ch/de/product/104217000000');
	expect(d!.imageUrl).toBe(
		'https://image.migros.ch/d/original/o-af-1-t.clr-fff/97d448ac1b032ff6d73b02ad3033ca3fcf3f6456/farmer-classic-mueesli-schokolade.jpg'
	);
	expect(d!.category).toBe('Brot & Backwaren');
	expect(d!.ingredients).toStartWith('Haferflocken 35%, Schokoladenplättchen 10%');
	expect(d!.ingredients).not.toContain('<strong>');
	expect(d!.nutrition).toEqual({
		basis: '100 g',
		energyKcal: 457,
		fat: 18,
		saturatedFat: 6.8,
		carbohydrate: 63,
		sugar: 20,
		fiber: 6.3,
		protein: 7.5,
		salt: 0.53
	});
});

test('mapProductDetail returns null when uid or name is missing', () => {
	expect(mapProductDetail({ name: 'no id' })).toBeNull();
	expect(mapProductDetail({ uid: 1 })).toBeNull();
});

test('mapProductDetail uses a cloudinary size stack and leaves unknown roots unlabelled', () => {
	const d = mapProductDetail(
		{
			uid: 5,
			name: 'X',
			images: [
				{ url: 'https://www-leshop-ch-cld-res.cloudinary.com/image/upload/{stack}/v2/p.png' }
			],
			breadcrumb: [{ id: '1', name: 'Other' }]
		},
		ROOTS
	);
	expect(d!.imageUrl).toBe(
		'https://www-leshop-ch-cld-res.cloudinary.com/image/upload/w_800,h_800,c_limit/v2/p.png'
	);
	expect(d!.category).toBeNull();
});

test('parseEnergyKcal reads kcal, falls back to kJ and ignores the approximation sign', () => {
	expect(parseEnergyKcal('287 kJ (69 kcal)')).toBe(69);
	expect(parseEnergyKcal('~ 78 kJ (~ 18 kcal)')).toBe(18);
	expect(parseEnergyKcal('418 kJ')).toBe(99.9);
	expect(parseEnergyKcal('n/a')).toBeNull();
	expect(parseEnergyKcal(undefined)).toBeNull();
});

test('mapNutrition converts units, treats < as zero and maps extended nutrients', () => {
	const n = mapNutrition({
		productInformation: {
			nutrientsInformation: {
				nutrientsTable: {
					headers: ['100 ml', '1 Glas (250 ml)'],
					rows: [
						{ label: 'Energie', values: ['287 kJ (69 kcal)', '710 kJ (170 kcal)'] },
						{ label: 'Eiweiss', values: ['3,2 g'] },
						{ label: 'Salz', values: ['< 0.01 g'] },
						{ label: 'Calcium', values: ['~ 124 mg'] },
						{ label: 'Vitamin D', values: ['0.5 µg'] },
						{ label: 'Natrium', values: ['0.2 g'] },
						{ label: 'Unbekannt', values: ['1 g'] }
					]
				}
			}
		}
	});
	expect(n.basis).toBe('100 ml');
	expect(n.energyKcal).toBe(69);
	expect(n.protein).toBe(3.2);
	expect(n.salt).toBe(0);
	expect(n.other).toEqual({ calcium: 124, vitaminD: 0.5, sodium: 200 });
});

test('mapNutrition yields an empty basis when the product has no nutrition table', () => {
	expect(mapNutrition({ productInformation: { nutrientsInformation: null } })).toEqual({
		basis: undefined
	});
});

type Calls = { tokens: number; details: string[][]; tokensUsed: string[] };

function product(uid: number, rootId: string | null) {
	return {
		uid,
		name: `P${uid}`,
		gtins: [`760${uid}`],
		breadcrumb: rootId ? [{ id: rootId, name: 'root' }] : []
	};
}

function fakeApi(
	respond: (ids: string[], attempt: number) => unknown[] | Error,
	calls: Calls = { tokens: 0, details: [], tokensUsed: [] }
): MigrosApi & { calls: Calls } {
	let attempt = 0;
	return {
		calls,
		async getGuestToken() {
			calls.tokens++;
			return `token-${calls.tokens}`;
		},
		async getProductDetails(ids, token) {
			calls.details.push(ids);
			calls.tokensUsed.push(token);
			const res = respond(ids, attempt++);
			if (res instanceof Error) throw res;
			return res;
		}
	};
}

const httpError = (status: number) =>
	Object.assign(new Error(`HTTP ${status}`), { response: { status } });

const noSleep = async () => {};

async function collect(
	client: Awaited<ReturnType<typeof createMigrosClient>>,
	resume = null as never
) {
	const out: Array<{ id: string; page: number }> = [];
	for await (const { id, cursor } of client.listProductIds({ resume })) {
		out.push({ id, page: cursor.page });
		expect(await client.getProduct(id)).not.toBeNull();
	}
	return out;
}

test('scans id batches, keeps only food roots and stops after consecutive empty batches', async () => {
	const api = fakeApi((ids) =>
		ids[0] === '1000'
			? [
					product(1001, '7494733'),
					product(1003, '999'),
					product(1002, '7494731'),
					product(1004, null)
				]
			: []
	);
	const client = await createMigrosClient(
		{ roots: ROOTS, firstId: 1000, batchSize: 10, maxEmptyBatches: 2, throttleMs: 0 },
		{ api, sleep: noSleep }
	);
	const out = await collect(client);
	expect(out).toEqual([
		{ id: '1001', page: 1002 },
		{ id: '1002', page: 1003 }
	]);
	expect(api.calls.details.map((ids) => ids[0])).toEqual(['1000', '1010', '1020']);
	expect(api.calls.details[0]).toHaveLength(10);
	expect(api.calls.tokens).toBe(1);
});

test('resumes from the cursor and ignores a checkpoint of another scan', async () => {
	const api = fakeApi(() => []);
	const client = await createMigrosClient(
		{ roots: ROOTS, firstId: 1000, batchSize: 5, maxEmptyBatches: 1, throttleMs: 0 },
		{ api, sleep: noSleep }
	);
	await collect(client, { category: 'ids', page: 2500 } as never);
	expect(api.calls.details[0][0]).toBe('2500');
	await collect(client, { category: '7494731', page: 3 } as never);
	expect(api.calls.details[1][0]).toBe('1000');
});

test('renews the guest token on 401 and retries the same batch', async () => {
	const api = fakeApi((_ids, attempt) => (attempt === 0 ? httpError(401) : []));
	const client = await createMigrosClient(
		{ roots: ROOTS, firstId: 1, batchSize: 3, maxEmptyBatches: 1, throttleMs: 0 },
		{ api, sleep: noSleep }
	);
	await collect(client);
	expect(api.calls.tokens).toBe(2);
	expect(api.calls.tokensUsed).toEqual(['token-1', 'token-2']);
	expect(api.calls.details[0]).toEqual(api.calls.details[1]);
});

test('retries 5xx and 429 with backoff, then surfaces the error', async () => {
	const sleeps: number[] = [];
	const sleep = async (ms: number) => {
		sleeps.push(ms);
	};
	const recovering = fakeApi((_ids, attempt) => (attempt < 2 ? httpError(503) : []));
	const ok = await createMigrosClient(
		{ roots: ROOTS, firstId: 1, batchSize: 3, maxEmptyBatches: 1, throttleMs: 0 },
		{ api: recovering, sleep }
	);
	await collect(ok);
	expect(sleeps).toEqual([2000, 4000]);

	const failing = fakeApi(() => httpError(429));
	const bad = await createMigrosClient(
		{ roots: ROOTS, firstId: 1, batchSize: 3, throttleMs: 0, maxAttempts: 3 },
		{ api: failing, sleep: noSleep }
	);
	await expect(collect(bad)).rejects.toThrow('HTTP 429');
	expect(failing.calls.details).toHaveLength(3);
});

test('does not retry other client errors', async () => {
	const api = fakeApi(() => httpError(403));
	const client = await createMigrosClient(
		{ roots: ROOTS, firstId: 1, batchSize: 3, throttleMs: 0 },
		{ api, sleep: noSleep }
	);
	await expect(collect(client)).rejects.toThrow('HTTP 403');
	expect(api.calls.details).toHaveLength(1);
});

test('paces calls by the throttle interval', async () => {
	const waits: number[] = [];
	const api = fakeApi(() => []);
	const client = await createMigrosClient(
		{ roots: ROOTS, firstId: 1, batchSize: 3, maxEmptyBatches: 3, throttleMs: 600 },
		{
			api,
			sleep: async (ms) => {
				waits.push(ms);
			}
		}
	);
	await collect(client);
	expect(waits.length).toBe(2);
	for (const ms of waits) expect(ms).toBeGreaterThan(0);
	expect(waits.every((ms) => ms <= 600)).toBe(true);
});

test('getProduct returns null for an id that was not scanned', async () => {
	const client = await createMigrosClient(
		{ roots: ROOTS },
		{ api: fakeApi(() => []), sleep: noSleep }
	);
	expect(await client.getProduct('42')).toBeNull();
});
