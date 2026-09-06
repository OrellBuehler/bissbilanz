import { describe, expect, test } from 'vitest';
import {
	importArchiveSchema,
	importFoodSchema,
	importEntrySchema,
	importSleepEntrySchema,
	importWeightEntrySchema
} from '../../src/lib/server/validation/import';
import { zonedTimeToInstant } from '../../src/lib/import/time';
import { computeSleepStats, formatClockMinutes } from '../../src/lib/utils/sleep-stats';

const FOOD_ID = '10000000-0000-4000-8000-000000000010';
const ENTRY_ID = '10000000-0000-4000-8000-000000000020';

const food = {
	id: FOOD_ID,
	name: 'Oats',
	brand: null,
	kind: 'food',
	servingSize: 100,
	servingUnit: 'g',
	calories: 389,
	protein: 13.2,
	carbs: 66.3,
	fat: 6.9,
	fiber: 10.6
};

describe('import row validators', () => {
	test('accepts an export food row and drops unknown keys', () => {
		const parsed = importFoodSchema.parse({ ...food, imageUrl: '/uploads/x.webp', userId: 'x' });
		expect(parsed.name).toBe('Oats');
		expect('imageUrl' in parsed).toBe(false);
		expect('userId' in parsed).toBe(false);
	});

	test('rejects a food without a valid serving unit', () => {
		expect(importFoodSchema.safeParse({ ...food, servingUnit: 'furlong' }).success).toBe(false);
	});

	test('rejects a non-uuid id', () => {
		expect(importFoodSchema.safeParse({ ...food, id: 'abc' }).success).toBe(false);
	});

	test('accepts an entry with an offset timestamp', () => {
		const parsed = importEntrySchema.parse({
			id: ENTRY_ID,
			date: '2026-01-01',
			eatenAt: '2026-01-01T08:30:00+02:00',
			mealType: 'Breakfast',
			servings: 1.5,
			foodId: FOOD_ID
		});
		expect(parsed.servings).toBe(1.5);
	});

	test('rejects a zero-serving entry and an empty meal type', () => {
		const base = { id: ENTRY_ID, date: '2026-01-01', mealType: 'Lunch', servings: 1 };
		expect(importEntrySchema.safeParse({ ...base, servings: 0 }).success).toBe(false);
		expect(importEntrySchema.safeParse({ ...base, mealType: '' }).success).toBe(false);
	});

	test('enforces the weight and sleep database ranges', () => {
		expect(
			importWeightEntrySchema.safeParse({ entryDate: '2026-01-01', weightKg: 600 }).success
		).toBe(false);
		expect(
			importSleepEntrySchema.safeParse({
				entryDate: '2026-01-01',
				durationMinutes: 1500,
				quality: 7
			}).success
		).toBe(false);
		expect(
			importSleepEntrySchema.safeParse({
				entryDate: '2026-01-01',
				durationMinutes: 450,
				quality: 12
			}).success
		).toBe(false);
	});

	test('rejects a malformed date', () => {
		expect(
			importWeightEntrySchema.safeParse({ entryDate: '01.01.2026', weightKg: 80 }).success
		).toBe(false);
	});

	test('ignores export sections that cannot be imported', () => {
		const parsed = importArchiveSchema.parse({
			formatVersion: 1,
			exportedAt: '2026-01-01T00:00:00.000Z',
			profile: { email: 'a@b.c' },
			aiTasks: [{ id: 'not-a-uuid' }],
			foods: [food],
			weightEntries: [{ entryDate: '2026-01-01', weightKg: 80 }]
		});
		expect(parsed.foods).toHaveLength(1);
		expect(parsed.weightEntries).toHaveLength(1);
		expect('aiTasks' in parsed).toBe(false);
	});
});

describe('zonedTimeToInstant', () => {
	test('resolves a wall clock in the given zone', () => {
		expect(zonedTimeToInstant('2026-01-15', '22:45', 'Europe/Zurich')).toBe(
			'2026-01-15T21:45:00.000Z'
		);
		expect(zonedTimeToInstant('2026-07-15', '22:45', 'Europe/Zurich')).toBe(
			'2026-07-15T20:45:00.000Z'
		);
		expect(zonedTimeToInstant('2026-01-15', '22:45', 'UTC')).toBe('2026-01-15T22:45:00.000Z');
	});

	test('returns null for an unparsable time', () => {
		expect(zonedTimeToInstant('2026-01-15', 'x', 'UTC')).toBeNull();
	});
});

describe('computeSleepStats', () => {
	const entry = (
		entryDate: string,
		durationMinutes: number,
		quality: number,
		bedtime?: string,
		wakeTime?: string
	) => ({
		entryDate,
		durationMinutes,
		quality,
		bedtime: bedtime ?? null,
		wakeTime: wakeTime ?? null
	});

	test('reports the most recent night and a windowed average', () => {
		const stats = computeSleepStats([
			entry('2026-01-01', 400, 6),
			entry('2026-01-03', 480, 8),
			entry('2026-01-02', 440, 7)
		]);
		expect(stats.lastNight?.entryDate).toBe('2026-01-03');
		expect(stats.averageDurationMinutes).toBe(440);
		expect(stats.averageQuality).toBe(7);
		expect(stats.nights).toBe(3);
	});

	test('limits the average to the requested window', () => {
		const entries = Array.from({ length: 10 }, (_, index) =>
			entry(`2026-01-${String(index + 1).padStart(2, '0')}`, index < 3 ? 600 : 300, 5)
		);
		expect(computeSleepStats(entries, 7).nights).toBe(7);
	});

	test('is empty without entries', () => {
		const stats = computeSleepStats([]);
		expect(stats.lastNight).toBeNull();
		expect(stats.averageDurationMinutes).toBeNull();
		expect(stats.averageBedtimeMinutes).toBeNull();
	});

	test('formats clock minutes', () => {
		expect(formatClockMinutes(0)).toBe('00:00');
		expect(formatClockMinutes(1425)).toBe('23:45');
	});
});
