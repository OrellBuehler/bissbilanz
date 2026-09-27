import { beforeEach, describe, expect, test, vi } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { createMockEvent } from '../helpers/mock-request-event';
import { TEST_USER } from '../helpers/fixtures';

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
		preview: { packageHash: pkg.packageHash }
	})
}));

vi.mock('$lib/server/food-package/commit', () => ({
	commitFoodPackageImport: async (_userId: string, _pkg: unknown, resolutions: unknown) => {
		commitCalls.push({ resolutions });
		return { created: { foods: 1, recipes: 0 } };
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
		expect(response.status).toBe(401);
	});

	test('export rejects an empty selection', async () => {
		const response = await exportRoute.POST(createMockEvent({ user: TEST_USER, body: {} }));
		expect(response.status).toBe(400);
		expect(exportCalls).toEqual([]);
	});

	test('export returns a zip attachment', async () => {
		const response = await exportRoute.POST(
			createMockEvent({ user: TEST_USER, body: { brands: ['Migros'], labels: ['bread'] } })
		);
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
		expect(bad.status).toBe(400);
		const ok = await summaryRoute.POST(createMockEvent({ user: TEST_USER, body: { all: true } }));
		expect(ok.status).toBe(200);
		expect((await ok.json()).foods).toBe(1);
	});

	test('preview requires auth and a file', async () => {
		expect(
			(await previewRoute.POST(upload('/api/foods/package/preview', { user: null }))).status
		).toBe(401);
		const missing = await previewRoute.POST(upload('/api/foods/package/preview', { file: null }));
		expect(missing.status).toBe(400);
		expect((await missing.json()).error).toBe('Missing package file');
	});

	test('preview reads the package and returns its hash', async () => {
		const response = await previewRoute.POST(upload('/api/foods/package/preview', {}));
		expect(response.status).toBe(200);
		expect((await response.json()).packageHash).toMatch(/^[a-f0-9]{64}$/);
	});

	test('preview rejects a file that is not a package', async () => {
		const response = await previewRoute.POST(
			upload('/api/foods/package/preview', { file: new Blob(['name,calories\n']) })
		);
		expect(response.status).toBe(400);
	});

	test('import requires valid resolutions', async () => {
		const missing = await importRoute.POST(upload('/api/foods/package/import', {}));
		expect(missing.status).toBe(400);
		expect((await missing.json()).error).toBe('Missing resolutions');

		const notJson = await importRoute.POST(
			upload('/api/foods/package/import', { resolutions: '{' })
		);
		expect(notJson.status).toBe(400);

		const invalid = await importRoute.POST(
			upload('/api/foods/package/import', { resolutions: JSON.stringify({ packageHash: 'x' }) })
		);
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
		expect(response.status).toBe(201);
		expect(commitCalls[0].resolutions).toEqual({ ...resolutions, recipes: [] });
	});
});
