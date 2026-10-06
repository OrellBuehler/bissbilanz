import { beforeEach, describe, expect, test, vi } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { createMockEvent } from '../helpers/mock-request-event';
import { TEST_USER } from '../helpers/fixtures';
import { expectResponseContract } from '../helpers/contract';
import { ApiError } from '$lib/server/errors';

let exportCalls: unknown[] = [];
let summaryCalls: unknown[] = [];
let commitCalls: Array<{ resolutions: unknown }> = [];
let exportFilename = 'bissbilanz-foods-2026-09-28.bissbilanz';
let previewTruncated = false;
let commitError: ApiError | null = null;

vi.mock('$lib/server/food-package/export', () => ({
	buildFoodPackage: async (_userId: string, selection: unknown) => {
		exportCalls.push(selection);
		return {
			bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
			foods: 1,
			recipes: 0,
			filename: exportFilename
		};
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
			newFoods: {
				count: 1,
				ingredientOnly: 1,
				samples: [{ ref: 'f1', name: 'Flour', brand: null, calories: 364 }],
				...(previewTruncated ? { itemsTruncated: true } : {}),
				items: [
					{
						ref: 'f1',
						role: 'ingredient',
						name: 'Flour',
						brand: null,
						servingSize: 100,
						servingUnit: 'g',
						calories: 364,
						recipes: [{ ref: 'r1', name: 'Bread' }]
					}
				]
			},
			newRecipes: { count: 0, samples: [] },
			conflicts: { foods: [], recipes: [] },
			issues: []
		}
	})
}));

vi.mock('$lib/server/food-package/commit', () => ({
	commitFoodPackageImport: async (_userId: string, _pkg: unknown, resolutions: unknown) => {
		commitCalls.push({ resolutions });
		if (commitError) throw commitError;
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
		exportFilename = 'bissbilanz-foods-2026-09-28.bissbilanz';
		commitError = null;
		previewTruncated = false;
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
		expect(response.headers.get('content-disposition')).toBe(
			`attachment; filename="bissbilanz-foods-2026-09-28.bissbilanz"; filename*=UTF-8''bissbilanz-foods-2026-09-28.bissbilanz`
		);
		expect(exportCalls).toEqual([{ brands: ['Migros'], labels: ['bread'] }]);
	});

	test('export names the download after its content, with an ASCII fallback', async () => {
		exportFilename = 'Käsespätzle.bissbilanz';
		const response = await exportRoute.POST(
			createMockEvent({ user: TEST_USER, body: { recipeIds: [crypto.randomUUID()] } })
		);
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('application/zip');
		expect(response.headers.get('content-disposition')).toBe(
			`attachment; filename="Kaesespaetzle.bissbilanz"; filename*=UTF-8''K%C3%A4sesp%C3%A4tzle.bissbilanz`
		);
	});

	test('summary validates the selection', async () => {
		const bad = await summaryRoute.POST(
			createMockEvent({ user: TEST_USER, body: { foodIds: ['not-a-uuid'] } })
		);
		// Not asserted: details is ZodError#format()'s recursive tree, which validationErrorResponseSchema can't describe without oasdiff flagging a breaking change (see shared.ts).
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
		// Not asserted: details is ZodError#format()'s recursive tree, which validationErrorResponseSchema can't describe without oasdiff flagging a breaking change (see shared.ts).
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
		expect(commitCalls[0].resolutions).toEqual({ ...resolutions, recipes: [], mappings: [] });
	});

	test('preview lists the foods that would be created', async () => {
		const response = await previewRoute.POST(upload('/api/foods/package/preview', {}));
		await expectResponseContract('POST', '/api/foods/package/preview', response);
		const { newFoods } = await response.json();
		expect(newFoods.items).toEqual([
			expect.objectContaining({
				ref: 'f1',
				role: 'ingredient',
				servingUnit: 'g',
				recipes: [{ ref: 'r1', name: 'Bread' }]
			})
		]);
	});

	test('preview flags a truncated list of new foods', async () => {
		previewTruncated = true;
		const response = await previewRoute.POST(upload('/api/foods/package/preview', {}));
		await expectResponseContract('POST', '/api/foods/package/preview', response);
		expect((await response.json()).newFoods.itemsTruncated).toBe(true);
	});

	test('preview answers a too-big package with the too-large code', async () => {
		const event = upload('/api/foods/package/preview', {});
		const body = new FormData();
		body.append('file', new File([packageZip()], 'foods.zip'));
		const oversized = {
			...event,
			request: new Request('http://localhost:5173/api/foods/package/preview', {
				method: 'POST',
				body,
				headers: { 'content-length': String(300 * 1024 * 1024) }
			})
		} as typeof event;
		const response = await previewRoute.POST(oversized);
		await expectResponseContract('POST', '/api/foods/package/preview', response);
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: 'File must be 200MB or smaller',
			details: { code: ['package_too_large'] }
		});
	});

	test('import passes mappings on to the commit', async () => {
		const resolutions = {
			packageHash: 'a'.repeat(64),
			mappings: [{ ref: 'f2', foodId: '00000000-0000-4000-8000-000000000002' }]
		};
		const response = await importRoute.POST(
			upload('/api/foods/package/import', { resolutions: JSON.stringify(resolutions) })
		);
		await expectResponseContract('POST', '/api/foods/package/import', response);
		expect(response.status).toBe(201);
		expect(commitCalls[0].resolutions).toEqual({ ...resolutions, foods: [], recipes: [] });
	});

	test('import rejects malformed mappings before committing', async () => {
		const bad = [
			[{ ref: 'r1', foodId: '00000000-0000-4000-8000-000000000002' }],
			[{ ref: 'f1', foodId: 'not-a-uuid' }],
			[{ ref: 'f1' }]
		];
		for (const mappings of bad) {
			const response = await importRoute.POST(
				upload('/api/foods/package/import', {
					resolutions: JSON.stringify({ packageHash: 'a'.repeat(64), mappings })
				})
			);
			// Not asserted: details is ZodError#format()'s recursive tree, which validationErrorResponseSchema can't describe without oasdiff flagging a breaking change (see shared.ts).
			expect(response.status).toBe(400);
		}
		expect(commitCalls).toEqual([]);
	});

	test('import reports an unusable mapping as a 400 error', async () => {
		commitError = new ApiError(400, 'Cannot map f1: the chosen food was not found');
		const response = await importRoute.POST(
			upload('/api/foods/package/import', {
				resolutions: JSON.stringify({
					packageHash: 'a'.repeat(64),
					mappings: [{ ref: 'f1', foodId: '00000000-0000-4000-8000-000000000002' }]
				})
			})
		);
		await expectResponseContract('POST', '/api/foods/package/import', response);
		expect(response.status).toBe(400);
		expect((await response.json()).error).toMatch(/Cannot map f1/);
	});

	test('import reports a stale preview as 409', async () => {
		commitError = new ApiError(409, 'stale_preview');
		const response = await importRoute.POST(
			upload('/api/foods/package/import', {
				resolutions: JSON.stringify({ packageHash: 'a'.repeat(64) })
			})
		);
		await expectResponseContract('POST', '/api/foods/package/import', response);
		expect(response.status).toBe(409);
	});

	test('import accepts a package whatever its file name', async () => {
		const body = new FormData();
		body.append('file', new File([packageZip()], 'Lasagne.bissbilanz'));
		body.append('resolutions', JSON.stringify({ packageHash: 'a'.repeat(64) }));
		const event = createMockEvent({ user: TEST_USER });
		const response = await importRoute.POST({
			...event,
			request: new Request('http://localhost:5173/api/foods/package/import', {
				method: 'POST',
				body
			})
		} as typeof event);
		await expectResponseContract('POST', '/api/foods/package/import', response);
		expect(response.status).toBe(201);
	});
});
