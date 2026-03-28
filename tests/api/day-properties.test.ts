import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createMockEvent } from '../helpers/mock-request-event';
import { TEST_USER } from '../helpers/fixtures';

const TEST_DAY_PROPERTIES = {
	date: '2026-03-22',
	isFastingDay: true
};

const TEST_DAY_PROPERTIES_RANGE = [
	{ date: '2026-03-20', isFastingDay: false },
	{ date: '2026-03-22', isFastingDay: true }
];

let mockGetResult: any = null;
let mockGetRangeResult: any = [];
let mockSetResult: any = null;
let mockDeleteResult: boolean = false;

vi.mock('$lib/server/day-properties', () => ({
	getDayProperties: async () => mockGetResult,
	getDayPropertiesRange: async () => mockGetRangeResult,
	setDayProperties: async () => mockSetResult,
	deleteDayProperties: async () => mockDeleteResult
}));

const { GET, PUT, DELETE } = await import('../../src/routes/api/day-properties/+server');

describe('api/day-properties', () => {
	beforeEach(() => {
		mockGetResult = null;
		mockGetRangeResult = [];
		mockSetResult = null;
		mockDeleteResult = false;
	});

	describe('GET /api/day-properties', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({ user: null, searchParams: { date: '2026-03-22' } });
			const response = await GET(event);
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('returns 400 when date param is missing', async () => {
			const event = createMockEvent({ user: TEST_USER });
			const response = await GET(event);
			const data = await response.json();
			expect(response.status).toBe(400);
			expect(data.error).toBe('date parameter is required');
		});

		test('returns 400 when date format is invalid', async () => {
			const event = createMockEvent({ user: TEST_USER, searchParams: { date: '22-03-2026' } });
			const response = await GET(event);
			const data = await response.json();
			expect(response.status).toBe(400);
			expect(data.error).toBe('Invalid date format, expected YYYY-MM-DD');
		});

		test('returns properties for a date', async () => {
			mockGetResult = TEST_DAY_PROPERTIES;
			const event = createMockEvent({ user: TEST_USER, searchParams: { date: '2026-03-22' } });
			const response = await GET(event);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.properties.date).toBe('2026-03-22');
			expect(data.properties.isFastingDay).toBe(true);
		});

		test('returns null when no properties set for date', async () => {
			mockGetResult = null;
			const event = createMockEvent({ user: TEST_USER, searchParams: { date: '2026-03-22' } });
			const response = await GET(event);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.properties).toBeNull();
		});

		test('returns range data when startDate and endDate provided', async () => {
			mockGetRangeResult = TEST_DAY_PROPERTIES_RANGE;
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { startDate: '2026-03-20', endDate: '2026-03-22' }
			});
			const response = await GET(event);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.data).toHaveLength(2);
		});

		test('returns 400 when startDate format is invalid in range query', async () => {
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { startDate: 'bad-date', endDate: '2026-03-22' }
			});
			const response = await GET(event);
			const data = await response.json();
			expect(response.status).toBe(400);
			expect(data.error).toBe('Invalid date format, expected YYYY-MM-DD');
		});
	});

	describe('PUT /api/day-properties', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({
				user: null,
				body: { date: '2026-03-22', isFastingDay: true }
			});
			const response = await PUT(event);
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('sets day properties with valid payload', async () => {
			mockSetResult = TEST_DAY_PROPERTIES;
			const event = createMockEvent({
				user: TEST_USER,
				body: { date: '2026-03-22', isFastingDay: true }
			});
			const response = await PUT(event);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.properties.date).toBe('2026-03-22');
			expect(data.properties.isFastingDay).toBe(true);
		});

		test('sets isFastingDay to false', async () => {
			mockSetResult = { date: '2026-03-22', isFastingDay: false };
			const event = createMockEvent({
				user: TEST_USER,
				body: { date: '2026-03-22', isFastingDay: false }
			});
			const response = await PUT(event);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.properties.isFastingDay).toBe(false);
		});

		test('returns 400 when date is missing', async () => {
			const event = createMockEvent({
				user: TEST_USER,
				body: { isFastingDay: true }
			});
			const response = await PUT(event);
			const data = await response.json();
			expect(response.status).toBe(400);
			expect(data.error).toBe('Invalid request body');
		});

		test('returns 400 when isFastingDay is missing', async () => {
			const event = createMockEvent({
				user: TEST_USER,
				body: { date: '2026-03-22' }
			});
			const response = await PUT(event);
			const data = await response.json();
			expect(response.status).toBe(400);
			expect(data.error).toBe('Invalid request body');
		});

		test('returns 400 when date format is invalid', async () => {
			const event = createMockEvent({
				user: TEST_USER,
				body: { date: 'not-a-date', isFastingDay: true }
			});
			const response = await PUT(event);
			const data = await response.json();
			expect(response.status).toBe(400);
			expect(data.error).toBe('Invalid request body');
		});

		test('returns 400 when isFastingDay is not boolean', async () => {
			const event = createMockEvent({
				user: TEST_USER,
				body: { date: '2026-03-22', isFastingDay: 'yes' }
			});
			const response = await PUT(event);
			const data = await response.json();
			expect(response.status).toBe(400);
			expect(data.error).toBe('Invalid request body');
		});
	});

	describe('DELETE /api/day-properties', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({ user: null, searchParams: { date: '2026-03-22' } });
			const response = await DELETE(event);
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('returns 400 when date param is missing', async () => {
			const event = createMockEvent({ user: TEST_USER });
			const response = await DELETE(event);
			const data = await response.json();
			expect(response.status).toBe(400);
			expect(data.error).toBe('date parameter is required');
		});

		test('returns 400 when date format is invalid', async () => {
			const event = createMockEvent({ user: TEST_USER, searchParams: { date: 'bad' } });
			const response = await DELETE(event);
			const data = await response.json();
			expect(response.status).toBe(400);
			expect(data.error).toBe('Invalid date format, expected YYYY-MM-DD');
		});

		test('deletes day properties and returns 204', async () => {
			mockDeleteResult = true;
			const event = createMockEvent({ user: TEST_USER, searchParams: { date: '2026-03-22' } });
			const response = await DELETE(event);
			expect(response.status).toBe(204);
		});
	});
});
