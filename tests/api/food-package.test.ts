import { beforeEach, describe, expect, test, vi } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { createMockEvent } from '../helpers/mock-request-event';
import { TEST_USER } from '../helpers/fixtures';
import { expectResponseContract } from '../helpers/contract';

let exportCalls: unknown[] = [];
let summaryCalls: unknown[] = [];
let commitCalls: Array<{ resolutions: unknown }> = [];

vi.mock('$lib/server/food-package/export', () => ({
	buildFoodPackage: async (_userId: string, selection: unknown) => {
		exportCalls.push(selection);
		return { bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04]), foods: 1, recipes: 0 };
	},
	summarizePackage: async (_userId: string, selection: unknown) => {
		summaryCalls.push(selection);
		return {
			foods: 1,
			recipes: 0,
			ingredientFoods: 0,
			images: 0,
			estimatedBytes: 1500,
			maxBytes: 50 * 1024 * 1024,
			overLimit: false
		};
	}
}));

vi.mock('$lib/server/food-package/plan', () => ({
	planFoodPackageImport: async (_userId: string, pkg: { packageHash: string }) => ({
		// The real planFoodPackageImport always returns the full preview shape
		// (totals, newFoods, newRecipes, conflicts, issues) — mirror that here
		// rather than just the hash the test asserts on.
		preview: {
			packageHash: pkg.packageHash,
			formatVersion: 1,
			exportedAt: null,
			totals: { foods: 0, recipes: 0, images: 0 },
			newFoods: { count: 0, ingredientOnly: 0, samples: [] },
			newRecipes: { count: 0, samples: [] },
			conflicts: { foods: [], recipes: [] },
			issues: []
		}
	})
}));

vi.mock('$lib/server/food-package/commit', () => ({
	commitFoodPackageImport: async (_userId: string, _pkg: unknown, resolutions: unknown) => {
		commitCalls.push({ resolutions });
		// The real commitFoodPackageImport always returns counts for every
		// resolution bucket plus images/issues, not just `created`.
		return {
			created: { foods: 1, recipes: 0 },
			replaced: { foods: 0, recipes: 0 },
			keptBoth: { foods: 0, recipes: 0 },
			skipped: { foods: 0, recipes: 0 },
			images: 0,
			issues: []
		};
	}
}));

const exportRoute = await import('../../src/routes/api/foods/package/export/+server');
const summaryRoute = await import('../../src/routes/api/foods/package/summary/+server');
const previewRoute = await import('../../src/routes/api/foods/package/preview/+server');
const importRoute = await import('../../src/routes/api/foods/package/import/+server');

const packageZip = () =>
	zipSync({
		'bissbilanz-foods.json': strToU8(
			JSON.stringify({ format: 'bissbilanz.food-package', formatVersion: 1, foods: [] })
		)
	});

function upload(
	path: string,
	options: { user?: typeof TEST_USER | null; file?: Blob | null; resolutions?: string }
) {
	const { user = TEST_USER, file = new Blob([packageZip()]), resolutions } = options;
	const body = new FormData();
	if (file) body.append('file', new File([file], 'foods.zip'));
	if (resolutions !== undefined) body.append('resolutions', resolutions);
	const event = createMockEvent({ user });
	return {
		...event,
		request: new Request(`http://localhost:5173${path}`, { method: 'POST', body })
	} as typeof event;
}

describe('food package routes', () => {
	beforeEach(() => {
		exportCalls = [];
		summaryCalls = [];
		commitCalls = [];
	});

	test('export requires auth', async () => {
		const response = await exportRoute.POST(createMockEvent({ body: { all: true } }));
		await expectResponseContract('POST', '/api/foods/package/export', response);
		expect(response.status).toBe(401);
	});

	test('export rejects an empty selection', async () => {
		const response = await exportRoute.POST(createMockEvent({ user: TEST_USER, body: {} }));
		await expectResponseContract('POST', '/api/foods/package/export', response);
		expect(response.status).toBe(400);
		expect(exportCalls).toEqual([]);
	});

	test('export returns a zip attachment', async () => {
		const response = await exportRoute.POST(
			createMockEvent({ user: TEST_USER, body: { brands: ['Migros'], labels: ['bread'] } })
		);
		// Not asserted with expectResponseContract: the 200 response is a binary
		// application/zip download, not JSON — the helper only validates JSON
		// bodies (and the spec correctly documents no application/json schema
		// for this status, so the coverage test doesn't expect it either).
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('application/zip');
		expect(response.headers.get('content-disposition')).toMatch(
			/attachment; filename="bissbilanz-foods-\d{4}-\d{2}-\d{2}\.zip"/
		);
		expect(exportCalls).toEqual([{ brands: ['Migros'], labels: ['bread'] }]);
	});

	test('summary validates the selection', async () => {
		const bad = await summaryRoute.POST(
			createMockEvent({ user: TEST_USER, body: { foodIds: ['not-a-uuid'] } })
		);
		await expectResponseContract('POST', '/api/foods/package/summary', bad);
		expect(bad.status).toBe(400);
		const ok = await summaryRoute.POST(createMockEvent({ user: TEST_USER, body: { all: true } }));
		await expectResponseContract('POST', '/api/foods/package/summary', ok);
		expect(ok.status).toBe(200);
		expect((await ok.json()).foods).toBe(1);
	});

	test('preview requires auth and a file', async () => {
		const unauthed = await previewRoute.POST(upload('/api/foods/package/preview', { user: null }));
		await expectResponseContract('POST', '/api/foods/package/preview', unauthed);
		expect(unauthed.status).toBe(401);
		const missing = await previewRoute.POST(upload('/api/foods/package/preview', { file: null }));
		await expectResponseContract('POST', '/api/foods/package/preview', missing);
		expect(missing.status).toBe(400);
		expect((await missing.json()).error).toBe('Missing package file');
	});

	test('preview reads the package and returns its hash', async () => {
		const response = await previewRoute.POST(upload('/api/foods/package/preview', {}));
		await expectResponseContract('POST', '/api/foods/package/preview', response);
		expect(response.status).toBe(200);
		expect((await response.json()).packageHash).toMatch(/^[a-f0-9]{64}$/);
	});

	test('preview rejects a file that is not a package', async () => {
		const response = await previewRoute.POST(
			upload('/api/foods/package/preview', { file: new Blob(['name,calories\n']) })
		);
		await expectResponseContract('POST', '/api/foods/package/preview', response);
		expect(response.status).toBe(400);
	});

	test('import requires valid resolutions', async () => {
		const missing = await importRoute.POST(upload('/api/foods/package/import', {}));
		await expectResponseContract('POST', '/api/foods/package/import', missing);
		expect(missing.status).toBe(400);
		expect((await missing.json()).error).toBe('Missing resolutions');

		const notJson = await importRoute.POST(
			upload('/api/foods/package/import', { resolutions: '{' })
		);
		await expectResponseContract('POST', '/api/foods/package/import', notJson);
		expect(notJson.status).toBe(400);

		const invalid = await importRoute.POST(
			upload('/api/foods/package/import', { resolutions: JSON.stringify({ packageHash: 'x' }) })
		);
		await expectResponseContract('POST', '/api/foods/package/import', invalid);
		expect(invalid.status).toBe(400);
		expect(commitCalls).toEqual([]);
	});

	test('import commits with parsed resolutions', async () => {
		const resolutions = {
			packageHash: 'a'.repeat(64),
			foods: [{ ref: 'f1', action: 'skip', existingId: '00000000-0000-4000-8000-000000000001' }]
		};
		const response = await importRoute.POST(
			upload('/api/foods/package/import', { resolutions: JSON.stringify(resolutions) })
		);
		await expectResponseContract('POST', '/api/foods/package/import', response);
		expect(response.status).toBe(201);
		expect(commitCalls[0].resolutions).toEqual({ ...resolutions, recipes: [] });
	});
});
