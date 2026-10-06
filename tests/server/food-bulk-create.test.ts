import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createMockDB } from '../helpers/mock-db';
import { ApiError } from '../../src/lib/server/errors';

const { db, reset, queueResults, getCalls } = createMockDB();
const schema = await import('$lib/server/schema');

let failTransaction = false;
const wrapped = new Proxy(db, {
	get(target, prop) {
		if (prop === 'transaction' && failTransaction) {
			return async () => {
				throw new Error('transaction failed');
			};
		}
		return target[prop as string];
	}
});

vi.mock('$lib/server/db', () => ({ getDB: () => wrapped }));

let renderError: Error | null = null;
let written = 0;
const dropped: string[][] = [];

vi.mock('$lib/server/images', () => ({
	renderThumbnail: async () => {
		if (renderError) throw renderError;
		return Buffer.alloc(1000);
	},
	writeUploadFile: async () => `written-${++written}.webp`,
	dropUploadFiles: async (filenames: string[]) => {
		dropped.push(filenames);
	}
}));

const { bulkCreateFoods, uploadQuotaBytes } = await import('$lib/server/food-bulk');

const USER = '20000000-0000-4000-8000-000000000001';
const OTHER = '20000000-0000-4000-8000-000000000002';
const macros = { calories: 100, protein: 1, carbs: 2, fat: 3, fiber: 4 };
let counter = 0;
const id = () => `10000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;
const item = (overrides: Record<string, unknown> = {}) => ({
	id: id(),
	name: 'Food',
	servingSize: 100,
	servingUnit: 'g',
	...macros,
	...overrides
});
const png = (size = 10, type = 'image/png') => new File([new Uint8Array(size)], 'a.png', { type });

const insertedValues = (table: unknown) =>
	getCalls()
		.filter((call, index, all) => call.method === 'values' && all[index - 1]?.args[0] === table)
		.flatMap((call) => call.args[0]);

beforeEach(() => {
	reset();
	failTransaction = false;
	renderError = null;
	dropped.length = 0;
	written = 0;
	vi.unstubAllEnvs();
});

describe('bulkCreateFoods', () => {
	test('creates new foods with their client ids and reports created', async () => {
		const [a, b] = [item({ name: 'A' }), item({ name: 'B', barcode: '7610000000001' })];
		queueResults([[], [], [{ id: a.id }, { id: b.id }]]);
		const results = await bulkCreateFoods(USER, [a, b], new Map());
		expect(results).toEqual([
			{ id: a.id, status: 'created' },
			{ id: b.id, status: 'created' }
		]);
		const rows = insertedValues(schema.foods);
		expect(rows.map((row: any) => [row.id, row.userId, row.barcode])).toEqual([
			[a.id, USER, null],
			[b.id, USER, '7610000000001']
		]);
	});

	test('answers in request order and echoes the id as sent', async () => {
		const upper = id().toUpperCase();
		const bad = item({ name: '' });
		const good = item({ id: upper });
		queueResults([[], [{ id: upper.toLowerCase() }]]);
		const results = await bulkCreateFoods(USER, [bad, good], new Map());
		expect(results.map((result) => [result.id, result.status])).toEqual([
			[bad.id, 'invalid'],
			[upper, 'created']
		]);
		expect(results[0].message).toContain('name');
	});

	test('reports exists for the same user and id_conflict for another', async () => {
		const mine = item();
		const theirs = item();
		queueResults([
			[
				{ id: mine.id, userId: USER },
				{ id: theirs.id, userId: OTHER }
			]
		]);
		const results = await bulkCreateFoods(USER, [mine, theirs], new Map());
		expect(results).toEqual([
			{ id: mine.id, status: 'exists' },
			{ id: theirs.id, status: 'id_conflict' }
		]);
		expect(getCalls().some((call) => call.method === 'insert')).toBe(false);
	});

	test('reports duplicate_barcode against the database and within the request', async () => {
		const clash = item({ barcode: '4000000000001' });
		const first = item({ barcode: '4000000000002' });
		const second = item({ barcode: '4000000000002' });
		queueResults([[], [{ barcode: '4000000000001' }], [{ id: first.id }]]);
		const results = await bulkCreateFoods(USER, [clash, first, second], new Map());
		expect(results.map((result) => result.status)).toEqual([
			'duplicate_barcode',
			'created',
			'duplicate_barcode'
		]);
	});

	test('flags duplicate ids inside one request as invalid', async () => {
		const first = item();
		const twin = { ...item(), id: first.id };
		queueResults([[], [{ id: first.id }]]);
		const results = await bulkCreateFoods(USER, [first, twin], new Map());
		expect(results[0].status).toBe('created');
		expect(results[1]).toMatchObject({ status: 'invalid', message: 'Duplicate id in request' });
	});

	test('rejects the request when an item has no usable id or the batch size is off', async () => {
		await expect(bulkCreateFoods(USER, [{ name: 'x' }], new Map())).rejects.toMatchObject({
			status: 400
		});
		await expect(bulkCreateFoods(USER, [null], new Map())).rejects.toMatchObject({ status: 400 });
		await expect(bulkCreateFoods(USER, [{ id: 'nope' }], new Map())).rejects.toMatchObject({
			status: 400
		});
		await expect(bulkCreateFoods(USER, [], new Map())).rejects.toMatchObject({ status: 400 });
		await expect(
			bulkCreateFoods(
				USER,
				Array.from({ length: 201 }, () => item()),
				new Map()
			)
		).rejects.toMatchObject({ status: 400 });
	});

	test('writes explicit labels as external, capped, then catalog labels', async () => {
		const labelled = item({
			labels: ['Apple', 'apple', 'Fruit'],
			categoriesTags: ['en:bananas', 'en:fruits']
		});
		queueResults([[], [{ id: labelled.id }], []]);
		await bulkCreateFoods(USER, [labelled], new Map());
		const rows = insertedValues(schema.foodLabels);
		expect(
			rows.filter((row: any) => row.source === 'external').map((row: any) => row.label)
		).toEqual(['apple', 'fruit']);
		expect(rows.every((row: any) => row.foodId === labelled.id && row.userId === USER)).toBe(true);
		expect(rows.some((row: any) => row.source === 'catalog')).toBe(true);
	});

	test('caps labels at 20 per food', async () => {
		const labels = Array.from(
			{ length: 20 },
			(_, index) => `label ${String.fromCharCode(97 + index)}`
		);
		const full = item({ labels, categoriesTags: ['en:bananas'] });
		queueResults([[], [{ id: full.id }], []]);
		await bulkCreateFoods(USER, [full], new Map());
		expect(insertedValues(schema.foodLabels)).toHaveLength(20);
	});

	test('stores an image: file written, uploads row with its size, imageUrl set', async () => {
		const pictured = item();
		queueResults([[], [{ total: '0' }], [{ id: pictured.id }], []]);
		const [result] = await bulkCreateFoods(USER, [pictured], new Map([[pictured.id, png()]]));
		expect(result).toEqual({
			id: pictured.id,
			status: 'created',
			imageUrl: '/uploads/written-1.webp'
		});
		expect(insertedValues(schema.uploads)).toEqual([
			{ filename: 'written-1.webp', userId: USER, sizeBytes: 1000 }
		]);
		expect((insertedValues(schema.foods)[0] as any).imageUrl).toBe('/uploads/written-1.webp');
	});

	test('creates the food without an image that is too large, not an image or corrupt', async () => {
		const [big, text, corrupt] = [item(), item(), item()];
		renderError = new ApiError(400, 'Invalid or corrupted image file');
		queueResults([[], [{ id: big.id }, { id: text.id }, { id: corrupt.id }]]);
		const results = await bulkCreateFoods(
			USER,
			[big, text, corrupt],
			new Map([
				[big.id, png(200 * 1024 + 1)],
				[text.id, png(5, 'text/plain')],
				[corrupt.id, png()]
			])
		);
		expect(results).toEqual([
			{ id: big.id, status: 'created', message: 'image_too_large' },
			{ id: text.id, status: 'created', message: 'image_invalid' },
			{ id: corrupt.id, status: 'created', message: 'image_invalid' }
		]);
		expect(written).toBe(0);
	});

	test('does not swallow an unexpected rendering failure', async () => {
		const pictured = item();
		renderError = new Error('sharp crashed');
		queueResults([[]]);
		await expect(
			bulkCreateFoods(USER, [pictured], new Map([[pictured.id, png()]]))
		).rejects.toThrow('sharp crashed');
	});

	test('refuses images past the per-user quota but still creates the food', async () => {
		vi.stubEnv('UPLOAD_QUOTA_BYTES', '1500');
		const [fits, over] = [item(), item()];
		queueResults([[], [{ total: '0' }], [{ id: fits.id }, { id: over.id }], []]);
		const results = await bulkCreateFoods(
			USER,
			[fits, over],
			new Map([
				[fits.id, png()],
				[over.id, png()]
			])
		);
		expect(results).toEqual([
			{ id: fits.id, status: 'created', imageUrl: '/uploads/written-1.webp' },
			{ id: over.id, status: 'created', message: 'quota_exceeded' }
		]);
	});

	test('counts what the user already stored against the quota', async () => {
		vi.stubEnv('UPLOAD_QUOTA_BYTES', '1500');
		const pictured = item();
		queueResults([[], [{ total: '1000' }], [{ id: pictured.id }]]);
		const [result] = await bulkCreateFoods(USER, [pictured], new Map([[pictured.id, png()]]));
		expect(result).toEqual({ id: pictured.id, status: 'created', message: 'quota_exceeded' });
	});

	test('a lost insert race is reported by what took the id or barcode, and its image dropped', async () => {
		const [exists, conflict, barcode] = [item(), item(), item({ barcode: '5000000000001' })];
		queueResults([
			[],
			[],
			[{ total: '0' }],
			[],
			[
				{ id: exists.id, userId: USER },
				{ id: conflict.id, userId: OTHER }
			]
		]);
		const results = await bulkCreateFoods(
			USER,
			[exists, conflict, barcode],
			new Map([[exists.id, png()]])
		);
		expect(results.map((result) => result.status)).toEqual([
			'exists',
			'id_conflict',
			'duplicate_barcode'
		]);
		expect(dropped).toEqual([['written-1.webp']]);
	});

	test('drops the written files and rethrows when the transaction fails', async () => {
		const pictured = item();
		failTransaction = true;
		queueResults([[], [{ total: '0' }]]);
		await expect(
			bulkCreateFoods(USER, [pictured], new Map([[pictured.id, png()]]))
		).rejects.toThrow('transaction failed');
		expect(dropped).toEqual([['written-1.webp']]);
	});
});

describe('uploadQuotaBytes', () => {
	test('defaults to 5 GB and ignores junk', () => {
		expect(uploadQuotaBytes({})).toBe(5 * 1024 ** 3);
		expect(uploadQuotaBytes({ UPLOAD_QUOTA_BYTES: 'lots' })).toBe(5 * 1024 ** 3);
		expect(uploadQuotaBytes({ UPLOAD_QUOTA_BYTES: '0' })).toBe(5 * 1024 ** 3);
		expect(uploadQuotaBytes({ UPLOAD_QUOTA_BYTES: '-1' })).toBe(5 * 1024 ** 3);
	});

	test('reads the configured value', () => {
		expect(uploadQuotaBytes({ UPLOAD_QUOTA_BYTES: '1048576' })).toBe(1048576);
	});
});
