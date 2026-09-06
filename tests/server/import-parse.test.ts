import { describe, test, expect, vi } from 'vitest';
import { zipSync, strToU8 } from 'fflate';

vi.mock('$lib/server/db', async () => {
	const schema = await import('$lib/server/schema');
	return { getDB: () => ({}), ...schema };
});

const { parseImportFile, MAX_IMPORT_BYTES } = await import('../../src/lib/server/import');
const { ApiError } = await import('../../src/lib/server/errors');

const archive = {
	formatVersion: 1,
	exportedAt: '2026-02-01T00:00:00.000Z',
	profile: { email: 'test@example.com' },
	foods: [
		{
			id: '10000000-0000-4000-8000-000000000010',
			name: 'Oats',
			brand: null,
			kind: 'food',
			servingSize: 100,
			servingUnit: 'g',
			calories: 389,
			protein: 13.2,
			carbs: 66.3,
			fat: 6.9,
			fiber: 10.6,
			imageUrl: '/uploads/gone.webp'
		}
	],
	weightEntries: [{ entryDate: '2026-01-01', weightKg: 80, loggedAt: '2026-01-01T07:00:00.000Z' }]
};

const zipFile = () => {
	const bytes = zipSync({ 'bissbilanz.json': strToU8(JSON.stringify(archive)) });
	return new File([bytes], 'bissbilanz-export-2026-02-01.zip', { type: 'application/zip' });
};

describe('parseImportFile', () => {
	test('reads bissbilanz.json out of an export zip', async () => {
		const parsed = await parseImportFile(zipFile(), 'UTC');
		expect(parsed.format).toBe('archive');
		expect(parsed.data.foods).toHaveLength(1);
		expect(parsed.data.weightEntries).toHaveLength(1);
		expect(parsed.issues).toEqual([]);
	});

	test('reads a bare bissbilanz.json too', async () => {
		const file = new File([JSON.stringify(archive)], 'bissbilanz.json', {
			type: 'application/json'
		});
		const parsed = await parseImportFile(file, 'UTC');
		expect(parsed.format).toBe('archive');
		expect(parsed.data.foods?.[0].name).toBe('Oats');
	});

	test('reports schema violations instead of throwing', async () => {
		const broken = { ...archive, foods: [{ ...archive.foods[0], servingUnit: 'furlong' }] };
		const file = new File([JSON.stringify(broken)], 'bissbilanz.json');
		const parsed = await parseImportFile(file, 'UTC');
		expect(parsed.data.foods).toBeUndefined();
		expect(parsed.issues.length).toBeGreaterThan(0);
	});

	test('detects a weight CSV from its header', async () => {
		const file = new File(['date,weight_kg\n2026-01-01,80.5\n'], 'my-weights.csv');
		const parsed = await parseImportFile(file, 'UTC');
		expect(parsed.format).toBe('weight-csv');
		expect(parsed.data.weightEntries).toEqual([
			{
				entryDate: '2026-01-01',
				weightKg: 80.5,
				notes: null,
				loggedAt: '2026-01-01T12:00:00.000Z'
			}
		]);
	});

	test('resolves sleep wall-clock times in the user timezone and rolls the wake time', async () => {
		const file = new File(['date,bedtime,wake_time,quality\n2026-01-01,23:00,06:30,8\n'], 'x.csv');
		const parsed = await parseImportFile(file, 'Europe/Zurich');
		expect(parsed.format).toBe('sleep-csv');
		const entry = parsed.data.sleepEntries?.[0];
		expect(entry?.bedtime).toBe('2026-01-01T22:00:00.000Z');
		expect(entry?.wakeTime).toBe('2026-01-02T05:30:00.000Z');
		expect(entry?.durationMinutes).toBe(450);
	});

	test('honours an explicit format hint over detection', async () => {
		const file = new File(['date,duration\n2026-01-01,7:30\n'], 'ambiguous.csv');
		const parsed = await parseImportFile(file, 'UTC', 'sleep-csv');
		expect(parsed.data.sleepEntries).toHaveLength(1);
	});

	test('rejects an empty file and an oversized file', async () => {
		await expect(parseImportFile(new File([], 'empty.csv'), 'UTC')).rejects.toBeInstanceOf(
			ApiError
		);
		const huge = new File(['x'], 'huge.zip');
		Object.defineProperty(huge, 'size', { value: MAX_IMPORT_BYTES + 1 });
		await expect(parseImportFile(huge, 'UTC')).rejects.toBeInstanceOf(ApiError);
	});

	test('rejects a file that is neither an archive nor a CSV', async () => {
		const file = new File(['not really anything'], 'notes.txt');
		await expect(parseImportFile(file, 'UTC')).rejects.toBeInstanceOf(ApiError);
	});
});
