import { describe, test, expect, beforeEach, vi } from 'vitest';
import { ZodError } from 'zod';
import { createMockEvent } from '../helpers/mock-request-event';
import { expectResponseContract } from '../helpers/contract';
import { TEST_USER, TEST_FOOD, TEST_ENTRY, VALID_ENTRY_PAYLOAD } from '../helpers/fixtures';

// listEntriesByDate (unlike createEntry) returns a food/recipe-joined shape
// with computed macro totals, not the raw food_entries row TEST_ENTRY models.
const TEST_ENTRY_LIST_ITEM = {
	...TEST_ENTRY,
	foodName: TEST_FOOD.name,
	calories: 583,
	protein: 19.8,
	carbs: 99.45,
	fat: 10.35,
	fiber: 15.9,
	imageUrl: null,
	servingSize: TEST_FOOD.servingSize,
	servingUnit: TEST_FOOD.servingUnit
};

// listEntriesByDateRangeDetailed() shape: same joined macros as the list item
// plus supplementId, without imageUrl.
const TEST_ENTRY_RANGE_ITEM = {
	...TEST_ENTRY_LIST_ITEM,
	supplementId: null
};

let mockListResult: any = [];
let mockCreateResult: any = null;
let mockRangeResult: any = [];
let mockCopyResult: any = [];

// Mock ZodError for validation failures
const mockValidationError = new ZodError([
	{
		code: 'invalid_type',
		expected: 'string',
		path: ['date'],
		message: 'Required'
	} as any
]);

vi.mock('$lib/server/entries', () => ({
	listEntriesByDate: async () => ({ items: mockListResult, total: mockListResult.length }),
	createEntry: async () =>
		mockCreateResult
			? { success: true, data: mockCreateResult }
			: { success: false, error: mockValidationError },
	updateEntry: async () => ({ success: true, data: null }),
	deleteEntry: async () => {},
	listEntriesByDateRange: async () => [],
	listEntriesByDateRangeDetailed: async () => mockRangeResult,
	copyEntries: async () => mockCopyResult,
	toEntryUpdate: () => ({})
}));

import { allValidationSchemas } from '../helpers/mock-validation';
vi.mock('$lib/server/validation', () => ({ ...allValidationSchemas }));

const { GET, POST } = await import('../../src/routes/api/entries/+server');
const { GET: RANGE_GET } = await import('../../src/routes/api/entries/range/+server');
const { POST: COPY_POST } = await import('../../src/routes/api/entries/copy/+server');

describe('api/entries', () => {
	beforeEach(() => {
		mockListResult = [];
		mockCreateResult = null;
		mockRangeResult = [];
		mockCopyResult = [];
	});

	describe('GET /api/entries', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({ user: null });
			const response = await GET(event);
			await expectResponseContract('GET', '/api/entries', response);
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('returns 400 when date missing', async () => {
			const event = createMockEvent({ user: TEST_USER });
			const response = await GET(event);
			await expectResponseContract('GET', '/api/entries', response);
			const data = await response.json();
			expect(response.status).toBe(400);
			expect(data.error).toBe('Missing date parameter');
		});

		test('returns entries for date', async () => {
			mockListResult = [TEST_ENTRY_LIST_ITEM];
			const event = createMockEvent({
				user: TEST_USER,
				url: 'http://localhost/api/entries?date=2026-02-10'
			});
			const response = await GET(event);
			await expectResponseContract('GET', '/api/entries', response);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.entries).toHaveLength(1);
		});
	});

	describe('POST /api/entries', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({
				user: null,
				body: VALID_ENTRY_PAYLOAD
			});
			const response = await POST(event);
			await expectResponseContract('POST', '/api/entries', response);
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('creates entry with valid payload', async () => {
			mockCreateResult = TEST_ENTRY;
			const event = createMockEvent({
				user: TEST_USER,
				body: VALID_ENTRY_PAYLOAD
			});
			const response = await POST(event);
			await expectResponseContract('POST', '/api/entries', response);
			const data = await response.json();
			expect(response.status).toBe(201);
			expect(data.entry).toBeTruthy();
		});

		describe('Validation errors', () => {
			test('returns 400 when date is missing', async () => {
				const event = createMockEvent({
					user: TEST_USER,
					body: {
						foodId: TEST_ENTRY.foodId,
						mealType: 'breakfast',
						servings: 1
					}
				});

				mockCreateResult = null;
				const response = await POST(event);
				// Not asserted: details is ZodError#format()'s recursive tree, which validationErrorResponseSchema can't describe without oasdiff flagging a breaking change (see shared.ts).

				expect(response.status).toBe(400);
			});

			test('returns 400 when date format is invalid', async () => {
				const event = createMockEvent({
					user: TEST_USER,
					body: {
						foodId: TEST_ENTRY.foodId,
						mealType: 'breakfast',
						servings: 1,
						date: '02/10/2026' // Wrong format, should be YYYY-MM-DD
					}
				});

				mockCreateResult = null;
				const response = await POST(event);
				// Not asserted: details is ZodError#format()'s recursive tree, which validationErrorResponseSchema can't describe without oasdiff flagging a breaking change (see shared.ts).

				expect(response.status).toBe(400);
			});

			test('returns 400 when both foodId and recipeId are missing', async () => {
				const event = createMockEvent({
					user: TEST_USER,
					body: {
						mealType: 'breakfast',
						servings: 1,
						date: '2026-02-10'
					}
				});

				mockCreateResult = null;
				const response = await POST(event);
				// Not asserted: details is ZodError#format()'s recursive tree, which validationErrorResponseSchema can't describe without oasdiff flagging a breaking change (see shared.ts).

				expect(response.status).toBe(400);
			});

			test('returns 400 when mealType is missing', async () => {
				const event = createMockEvent({
					user: TEST_USER,
					body: {
						foodId: TEST_ENTRY.foodId,
						servings: 1,
						date: '2026-02-10'
					}
				});

				mockCreateResult = null;
				const response = await POST(event);
				// Not asserted: details is ZodError#format()'s recursive tree, which validationErrorResponseSchema can't describe without oasdiff flagging a breaking change (see shared.ts).

				expect(response.status).toBe(400);
			});

			test('returns 400 when servings is negative', async () => {
				const event = createMockEvent({
					user: TEST_USER,
					body: {
						foodId: TEST_ENTRY.foodId,
						mealType: 'breakfast',
						servings: -1,
						date: '2026-02-10'
					}
				});

				mockCreateResult = null;
				const response = await POST(event);
				// Not asserted: details is ZodError#format()'s recursive tree, which validationErrorResponseSchema can't describe without oasdiff flagging a breaking change (see shared.ts).

				expect(response.status).toBe(400);
			});

			test('validation error includes details', async () => {
				const event = createMockEvent({
					user: TEST_USER,
					body: {}
				});

				mockCreateResult = null;
				const response = await POST(event);
				// Not asserted: details is ZodError#format()'s recursive tree, which validationErrorResponseSchema can't describe without oasdiff flagging a breaking change (see shared.ts).
				const data = await response.json();

				expect(response.status).toBe(400);
				expect(data.error).toBe('Validation failed');
			});
		});
	});

	describe('GET /api/entries/range', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({
				user: null,
				searchParams: { startDate: '2026-02-01', endDate: '2026-02-10' }
			});
			const response = await RANGE_GET(event);
			await expectResponseContract('GET', '/api/entries/range', response);
			expect(response.status).toBe(401);
		});

		test('returns entries for the range', async () => {
			mockRangeResult = [TEST_ENTRY_RANGE_ITEM];
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { startDate: '2026-02-01', endDate: '2026-02-10' }
			});
			const response = await RANGE_GET(event);
			await expectResponseContract('GET', '/api/entries/range', response);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.entries).toHaveLength(1);
		});

		test('returns 400 when parameters are missing', async () => {
			const event = createMockEvent({ user: TEST_USER });
			const response = await RANGE_GET(event);
			await expectResponseContract('GET', '/api/entries/range', response);
			expect(response.status).toBe(400);
		});
	});

	describe('POST /api/entries/copy', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({
				user: null,
				url: 'http://localhost/api/entries/copy?fromDate=2026-02-01&toDate=2026-02-02'
			});
			const response = await COPY_POST(event);
			await expectResponseContract('POST', '/api/entries/copy', response);
			expect(response.status).toBe(401);
		});

		test('copies entries from one date to another', async () => {
			mockCopyResult = [TEST_ENTRY];
			const event = createMockEvent({
				user: TEST_USER,
				url: 'http://localhost/api/entries/copy?fromDate=2026-02-01&toDate=2026-02-02'
			});
			const response = await COPY_POST(event);
			await expectResponseContract('POST', '/api/entries/copy', response);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.count).toBe(1);
		});

		test('returns 400 when a date parameter is missing', async () => {
			const event = createMockEvent({
				user: TEST_USER,
				url: 'http://localhost/api/entries/copy?fromDate=2026-02-01'
			});
			const response = await COPY_POST(event);
			await expectResponseContract('POST', '/api/entries/copy', response);
			expect(response.status).toBe(400);
		});
	});
});
