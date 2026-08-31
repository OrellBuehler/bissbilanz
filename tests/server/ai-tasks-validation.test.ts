import { describe, test, expect } from 'vitest';
import {
	aiTaskCreateSchema,
	aiTaskUpdateSchema,
	aiTaskListQuerySchema,
	aiTaskAcknowledgeSchema,
	MAX_AI_TASK_PHOTOS
} from '../../src/lib/server/validation';

describe('aiTaskCreateSchema', () => {
	const validPhotoUrl = '/uploads/10000000-0000-4000-8000-000000000001.webp';

	test('validates a task with description only', () => {
		const result = aiTaskCreateSchema.safeParse({
			description: 'Chicken salad for lunch',
			date: '2026-02-10'
		});
		expect(result.success).toBe(true);
	});

	test('validates a task with photoUrl only', () => {
		const result = aiTaskCreateSchema.safeParse({
			photoUrl: validPhotoUrl,
			date: '2026-02-10'
		});
		expect(result.success).toBe(true);
	});

	test('validates a task with both description and photoUrl', () => {
		const result = aiTaskCreateSchema.safeParse({
			description: 'Leftover pasta',
			photoUrl: validPhotoUrl,
			date: '2026-02-10'
		});
		expect(result.success).toBe(true);
	});

	test('rejects a task with neither description nor photoUrl', () => {
		const result = aiTaskCreateSchema.safeParse({
			date: '2026-02-10'
		});
		expect(result.success).toBe(false);
	});

	test('rejects a task with empty description and no photoUrl', () => {
		const result = aiTaskCreateSchema.safeParse({
			description: '',
			date: '2026-02-10'
		});
		expect(result.success).toBe(false);
	});

	test('rejects missing date', () => {
		const result = aiTaskCreateSchema.safeParse({
			description: 'Chicken salad'
		});
		expect(result.success).toBe(false);
	});

	test('rejects invalid date format', () => {
		const result = aiTaskCreateSchema.safeParse({
			description: 'Chicken salad',
			date: '02-10-2026'
		});
		expect(result.success).toBe(false);
	});

	test('rejects description over 2000 characters', () => {
		const result = aiTaskCreateSchema.safeParse({
			description: 'a'.repeat(2001),
			date: '2026-02-10'
		});
		expect(result.success).toBe(false);
	});

	test('accepts description at 2000 character boundary', () => {
		const result = aiTaskCreateSchema.safeParse({
			description: 'a'.repeat(2000),
			date: '2026-02-10'
		});
		expect(result.success).toBe(true);
	});

	test('rejects photoUrl not matching the uploads pattern', () => {
		const result = aiTaskCreateSchema.safeParse({
			photoUrl: '/uploads/not-a-uuid.png',
			date: '2026-02-10'
		});
		expect(result.success).toBe(false);
	});

	test('rejects photoUrl with a path traversal attempt', () => {
		const result = aiTaskCreateSchema.safeParse({
			photoUrl: '/uploads/../secrets.webp',
			date: '2026-02-10'
		});
		expect(result.success).toBe(false);
	});

	test('rejects an absolute external photoUrl', () => {
		const result = aiTaskCreateSchema.safeParse({
			photoUrl: 'https://example.com/photo.webp',
			date: '2026-02-10'
		});
		expect(result.success).toBe(false);
	});

	test('validates a task with several photoUrls', () => {
		const result = aiTaskCreateSchema.safeParse({
			photoUrls: [validPhotoUrl, '/uploads/20000000-0000-4000-8000-000000000002.webp'],
			date: '2026-02-10'
		});
		expect(result.success).toBe(true);
	});

	test('accepts photoUrls at the photo limit', () => {
		const result = aiTaskCreateSchema.safeParse({
			photoUrls: Array.from({ length: MAX_AI_TASK_PHOTOS }, () => validPhotoUrl),
			date: '2026-02-10'
		});
		expect(result.success).toBe(true);
	});

	test('rejects photoUrls over the photo limit', () => {
		const result = aiTaskCreateSchema.safeParse({
			photoUrls: Array.from({ length: MAX_AI_TASK_PHOTOS + 1 }, () => validPhotoUrl),
			date: '2026-02-10'
		});
		expect(result.success).toBe(false);
	});

	test('rejects a photoUrls entry not matching the uploads pattern', () => {
		const result = aiTaskCreateSchema.safeParse({
			photoUrls: [validPhotoUrl, '/uploads/../secrets.webp'],
			date: '2026-02-10'
		});
		expect(result.success).toBe(false);
	});

	test('rejects an empty photoUrls array with no description', () => {
		const result = aiTaskCreateSchema.safeParse({
			photoUrls: [],
			date: '2026-02-10'
		});
		expect(result.success).toBe(false);
	});

	test('accepts optional mealType and normalizes it', () => {
		const result = aiTaskCreateSchema.safeParse({
			description: 'Chicken salad',
			date: '2026-02-10',
			mealType: 'breakfast'
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.mealType).toBe('Breakfast');
		}
	});

	test('rejects invalid source', () => {
		const result = aiTaskCreateSchema.safeParse({
			description: 'Chicken salad',
			date: '2026-02-10',
			source: 'desktop'
		});
		expect(result.success).toBe(false);
	});

	test.each(['web', 'ios', 'android'])('accepts source %s', (source) => {
		const result = aiTaskCreateSchema.safeParse({
			description: 'Chicken salad',
			date: '2026-02-10',
			source
		});
		expect(result.success).toBe(true);
	});
});

describe('aiTaskUpdateSchema', () => {
	test('allows empty update', () => {
		const result = aiTaskUpdateSchema.safeParse({});
		expect(result.success).toBe(true);
	});

	test('allows updating status only', () => {
		const result = aiTaskUpdateSchema.safeParse({ status: 'completed' });
		expect(result.success).toBe(true);
	});

	test.each(['pending', 'completed', 'dismissed'])('accepts status %s', (status) => {
		const result = aiTaskUpdateSchema.safeParse({ status });
		expect(result.success).toBe(true);
	});

	test('rejects an invalid status', () => {
		const result = aiTaskUpdateSchema.safeParse({ status: 'archived' });
		expect(result.success).toBe(false);
	});

	test('allows updating resultSummary', () => {
		const result = aiTaskUpdateSchema.safeParse({
			resultSummary: 'Logged 2 entries for lunch'
		});
		expect(result.success).toBe(true);
	});

	test('rejects resultSummary over 2000 characters', () => {
		const result = aiTaskUpdateSchema.safeParse({ resultSummary: 'a'.repeat(2001) });
		expect(result.success).toBe(false);
	});

	test('allows updating createdEntryIds', () => {
		const result = aiTaskUpdateSchema.safeParse({
			createdEntryIds: ['10000000-0000-4000-8000-000000000001']
		});
		expect(result.success).toBe(true);
	});

	test('rejects createdEntryIds over 50 items', () => {
		const result = aiTaskUpdateSchema.safeParse({
			createdEntryIds: Array.from({ length: 51 }, (_, i) => `entry-${i}`)
		});
		expect(result.success).toBe(false);
	});

	test('allows updating description, date and mealType', () => {
		const result = aiTaskUpdateSchema.safeParse({
			description: 'Updated description',
			date: '2026-02-11',
			mealType: 'dinner'
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.mealType).toBe('Dinner');
		}
	});

	test('rejects invalid date format in update', () => {
		const result = aiTaskUpdateSchema.safeParse({ date: 'bad-date' });
		expect(result.success).toBe(false);
	});

	test.each([true, false])('accepts acknowledged %s', (acknowledged) => {
		const result = aiTaskUpdateSchema.safeParse({ acknowledged });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.acknowledged).toBe(acknowledged);
		}
	});

	test('rejects a non-boolean acknowledged', () => {
		const result = aiTaskUpdateSchema.safeParse({ acknowledged: 'yes' });
		expect(result.success).toBe(false);
	});
});

describe('aiTaskAcknowledgeSchema', () => {
	test('allows an empty body, meaning acknowledge everything unread', () => {
		const result = aiTaskAcknowledgeSchema.safeParse({});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.ids).toBeUndefined();
		}
	});

	test('accepts a list of task ids', () => {
		const result = aiTaskAcknowledgeSchema.safeParse({
			ids: ['10000000-0000-4000-8000-000000000001']
		});
		expect(result.success).toBe(true);
	});

	test('rejects non-uuid ids', () => {
		const result = aiTaskAcknowledgeSchema.safeParse({ ids: ['not-a-uuid'] });
		expect(result.success).toBe(false);
	});

	test('rejects more than 100 ids', () => {
		const result = aiTaskAcknowledgeSchema.safeParse({
			ids: Array.from({ length: 101 }, () => '10000000-0000-4000-8000-000000000001')
		});
		expect(result.success).toBe(false);
	});
});

describe('aiTaskListQuerySchema', () => {
	test('allows no filters (defaults applied)', () => {
		const result = aiTaskListQuerySchema.safeParse({});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.limit).toBe(100);
			expect(result.data.offset).toBe(0);
		}
	});

	test.each(['pending', 'completed', 'dismissed'])('accepts status filter %s', (status) => {
		const result = aiTaskListQuerySchema.safeParse({ status });
		expect(result.success).toBe(true);
	});

	test('rejects an invalid status filter', () => {
		const result = aiTaskListQuerySchema.safeParse({ status: 'archived' });
		expect(result.success).toBe(false);
	});

	test('coerces limit and offset from strings', () => {
		const result = aiTaskListQuerySchema.safeParse({ limit: '10', offset: '5' });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.limit).toBe(10);
			expect(result.data.offset).toBe(5);
		}
	});

	test.each([
		['true', true],
		['false', false]
	])('coerces the acknowledged query param %s', (raw, expected) => {
		const result = aiTaskListQuerySchema.safeParse({ acknowledged: raw });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.acknowledged).toBe(expected);
		}
	});

	test('leaves acknowledged undefined when the param is absent', () => {
		const result = aiTaskListQuerySchema.safeParse({});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.acknowledged).toBeUndefined();
		}
	});
});
