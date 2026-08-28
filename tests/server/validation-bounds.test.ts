import { describe, test, expect } from 'vitest';
import { sleepCreateSchema, sleepUpdateSchema } from '$lib/server/validation/sleep';
import { supplementUpdateSchema } from '$lib/server/validation/supplements';
import { entryUpdateSchema } from '$lib/server/validation/entries';
import { recipeCreateSchema } from '$lib/server/validation/recipes';
import { foodCreateSchema } from '$lib/server/validation/foods';

const sleepBase = { durationMinutes: 400, quality: 5, entryDate: '2026-08-28' };

describe('sleep timestamps', () => {
	// A 400 here is unrecoverable: the offline queue dead-letters 4xx, so a mobile
	// client sending local-offset instants lost the edit outright.
	test('accepts an offset-form instant, matching entries.eatenAt', () => {
		expect(
			sleepCreateSchema.safeParse({ ...sleepBase, bedtime: '2026-08-27T22:00:00+02:00' }).success
		).toBe(true);
		expect(sleepUpdateSchema.safeParse({ wakeTime: '2026-08-28T07:00:00-05:00' }).success).toBe(
			true
		);
	});

	test('still accepts a UTC instant', () => {
		expect(
			sleepCreateSchema.safeParse({ ...sleepBase, bedtime: '2026-08-27T20:00:00Z' }).success
		).toBe(true);
	});

	test('rejects a non-timestamp', () => {
		expect(sleepCreateSchema.safeParse({ ...sleepBase, bedtime: 'last night' }).success).toBe(
			false
		);
	});
});

describe('supplement dates', () => {
	// Backs a Postgres `date` column, so an unvalidated string 500s on insert.
	test('rejects a non-date scheduleStartDate', () => {
		expect(supplementUpdateSchema.safeParse({ scheduleStartDate: 'not-a-date' }).success).toBe(
			false
		);
	});

	test('accepts a calendar date', () => {
		expect(supplementUpdateSchema.safeParse({ scheduleStartDate: '2026-08-28' }).success).toBe(
			true
		);
	});
});

describe('field bounds', () => {
	test('rejects an oversized entry note', () => {
		expect(entryUpdateSchema.safeParse({ notes: 'x'.repeat(2001) }).success).toBe(false);
	});

	test('rejects an unbounded recipe ingredient list', () => {
		const ingredient = {
			foodId: '00000000-0000-0000-0000-000000000001',
			quantity: 1,
			servingUnit: 'g'
		};
		expect(
			recipeCreateSchema.safeParse({
				name: 'Big',
				totalServings: 1,
				ingredients: Array.from({ length: 101 }, () => ingredient)
			}).success
		).toBe(false);
	});
});

describe('imageUrl', () => {
	const food = {
		name: 'Test',
		servingSize: 100,
		servingUnit: 'g',
		calories: 1,
		protein: 1,
		carbs: 1,
		fat: 1,
		fiber: 1
	};

	test('accepts an app-relative path', () => {
		expect(foodCreateSchema.safeParse({ ...food, imageUrl: '/uploads/a.webp' }).success).toBe(true);
	});

	// Passes a bare startsWith('/') check but loads from a third-party origin.
	test('rejects a protocol-relative URL', () => {
		expect(foodCreateSchema.safeParse({ ...food, imageUrl: '//evil.test/x.png' }).success).toBe(
			false
		);
	});

	test('rejects a javascript: URL', () => {
		expect(foodCreateSchema.safeParse({ ...food, imageUrl: 'javascript:alert(1)' }).success).toBe(
			false
		);
	});
});
