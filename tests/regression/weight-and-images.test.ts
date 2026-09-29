import { describe, test, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { createMockEvent } from '../helpers/mock-request-event';
import { TEST_USER } from '../helpers/fixtures';

const UPLOAD_DIR = await mkdtemp(join(tmpdir(), 'bissbilanz-regression-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

let trendCalls: string[][] = [];
let uploadInsertFails = false;
const createWeightCalls: Record<string, unknown>[] = [];

vi.mock('$lib/server/weight', () => ({
	getWeightEntries: async () => [],
	getWeightWithTrend: async (_userId: string, from: string, to: string) => {
		trendCalls.push([from, to]);
		return [];
	},
	createWeightEntry: async (_userId: string, input: Record<string, unknown>) => {
		createWeightCalls.push(input);
		return { success: true, data: { id: 'w1', weightKg: 80, entryDate: '2026-02-10' } };
	},
	getLatestWeight: async () => null
}));

vi.mock('$lib/server/db', async (importOriginal) => {
	const schema = await import('$lib/server/schema');
	return {
		...(await importOriginal<Record<string, unknown>>()),
		...schema,
		getDB: () => ({
			insert: () => ({
				values: async () => {
					if (uploadInsertFails) throw new Error('db down');
				}
			})
		})
	};
});

const weightRoute = await import('../../src/routes/api/weight/+server');
const { processImage } = await import('$lib/server/images');
const { createHandlers } = await import('$lib/server/mcp/create-handlers');

beforeEach(() => {
	trendCalls = [];
	createWeightCalls.length = 0;
	uploadInsertFails = false;
});

afterAll(() => rm(UPLOAD_DIR, { recursive: true, force: true }));

describe('69119260 weight trend query validates from/to and MCP log_weight maps date to entryDate', () => {
	test('GET /api/weight?from&to rejects a non-date with 400 before querying the DB', async () => {
		const response = await weightRoute.GET(
			createMockEvent({
				user: TEST_USER,
				url: 'http://localhost/api/weight?from=yesterday&to=2026-02-10'
			})
		);
		expect(response.status).toBe(400);
		expect(typeof (await response.json()).error).toBe('string');
		expect(trendCalls).toHaveLength(0);
	});

	test('GET /api/weight?from&to with valid dates reaches the trend query', async () => {
		const response = await weightRoute.GET(
			createMockEvent({
				user: TEST_USER,
				url: 'http://localhost/api/weight?from=2026-02-01&to=2026-02-10'
			})
		);
		expect(response.status).toBe(200);
		expect(trendCalls).toEqual([['2026-02-01', '2026-02-10']]);
	});

	test('handleLogWeight passes the date as entryDate (the field the schema validates)', async () => {
		const { handleLogWeight } = createHandlers({
			createWeightEntry: async (_userId: string, input: Record<string, unknown>) => {
				createWeightCalls.push(input);
				return { success: true, data: { id: 'w1', weightKg: 80, entryDate: '2026-02-10' } };
			},
			getLatestWeight: async () => null
		} as never);
		await handleLogWeight(TEST_USER.id, { weightKg: 80, date: '2026-02-10', notes: 'x' });
		expect(createWeightCalls[0]).toEqual({
			weightKg: 80,
			entryDate: '2026-02-10',
			notes: 'x'
		});
		expect(createWeightCalls[0]).not.toHaveProperty('date');
	});
});

describe('3a682cd5 processImage turns sharp and storage failures into ApiErrors', () => {
	test('a corrupted upload is a 400, not an unhandled sharp error', async () => {
		const file = new File([new Uint8Array([1, 2, 3, 4, 5])], 'broken.png');
		await expect(processImage(file, TEST_USER.id)).rejects.toMatchObject({
			status: 400,
			message: 'Invalid or corrupted image file'
		});
		expect(await readdir(UPLOAD_DIR)).toEqual([]);
	});

	test('a failed ownership insert is a 500 and does not leave the file behind', async () => {
		const png = await sharp({
			create: { width: 8, height: 8, channels: 3, background: '#336699' }
		})
			.png()
			.toBuffer();
		uploadInsertFails = true;
		await expect(
			processImage(new File([new Uint8Array(png)], 'ok.png'), TEST_USER.id)
		).rejects.toMatchObject({ status: 500, message: 'Failed to save image' });
		expect(await readdir(UPLOAD_DIR)).toEqual([]);
	});

	test('a good image is stored as a webp under /uploads/', async () => {
		const png = await sharp({
			create: { width: 8, height: 8, channels: 3, background: '#336699' }
		})
			.png()
			.toBuffer();
		const url = await processImage(new File([new Uint8Array(png)], 'ok.png'), TEST_USER.id);
		expect(url).toMatch(/^\/uploads\/[a-f0-9-]+\.webp$/);
		expect(await readdir(UPLOAD_DIR)).toHaveLength(1);
	});
});
