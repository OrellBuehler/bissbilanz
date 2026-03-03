import { describe, test, expect, beforeEach, vi } from 'vitest';
import { ZodError } from 'zod';
import { createMockEvent } from '../helpers/mock-request-event';
import { TEST_USER, TEST_ENTRY, VALID_ENTRY_PAYLOAD } from '../helpers/fixtures';

let mockListResult: any = [];
let mockCreateResult: any = null;

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
	listEntriesByDate: async () => mockListResult,
	createEntry: async () =>
		mockCreateResult
			? { success: true, data: mockCreateResult }
			: { success: false, error: mockValidationError },
	updateEntry: async () => ({ success: true, data: null }),
	deleteEntry: async () => {},
	listEntriesByDateRange: async () => [],
	copyEntries: async () => 0,
	toEntryUpdate: () => ({})
}));

import { allValidationSchemas } from '../helpers/mock-validation';
vi.mock('$lib/server/validation', () => ({ ...allValidationSchemas }));

const { GET, POST } = await import('../../src/routes/api/entries/+server');

describe('api/entries', () => {
	beforeEach(() => {
		mockListResult = [];
		mockCreateResult = null;
	});

	describe('GET /api/entries', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({ user: null });
			const response = await GET(event);
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('returns 400 when date missing', async () => {
			const event = createMockEvent({ user: TEST_USER });
			const response = await GET(event);
			const data = await response.json();
			expect(response.status).toBe(400);
			expect(data.error).toBe('Missing date parameter');
		});

		test('returns entries for date', async () => {
			mockListResult = [TEST_ENTRY];
			const event = createMockEvent({
				user: TEST_USER,
				url: 'http://localhost/api/entries?date=2026-02-10'
			});
			const response = await GET(event);
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

				expect(response.status).toBe(400);
			});

			test('validation error includes details', async () => {
				const event = createMockEvent({
					user: TEST_USER,
					body: {}
				});

				mockCreateResult = null;
				const response = await POST(event);
				const data = await response.json();

				expect(response.status).toBe(400);
				expect(data.error).toBe('Validation failed');
			});
		});
	});
});
