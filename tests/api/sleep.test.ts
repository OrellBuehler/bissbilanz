import { describe, test, expect, beforeEach, vi } from 'vitest';
import { ZodError } from 'zod';
import { createMockEvent } from '../helpers/mock-request-event';
import { TEST_USER } from '../helpers/fixtures';

const TEST_SLEEP_ENTRY = {
	id: '20000000-0000-4000-8000-000000000090',
	userId: TEST_USER.id,
	entryDate: '2026-03-01',
	durationMinutes: 480,
	quality: 8,
	bedtime: null,
	wakeTime: null,
	wakeUps: null,
	notes: null,
	loggedAt: new Date('2026-03-01T06:05:00Z'),
	createdAt: new Date('2026-03-01T06:05:00Z'),
	updatedAt: null
};

let mockGetEntriesResult: any = [];
let mockGetByRangeResult: any = [];
let mockCreateResult: any = null;
let mockUpdateResult: any = undefined;
let mockDeleteResult: boolean = false;

vi.mock('$lib/server/sleep', () => ({
	getSleepEntries: async () => mockGetEntriesResult,
	getSleepEntriesByDateRange: async () => mockGetByRangeResult,
	createSleepEntry: async (_userId: string, _payload: unknown) =>
		mockCreateResult
			? { success: true, data: mockCreateResult }
			: {
					success: false,
					error: new ZodError([
						{
							code: 'too_small',
							minimum: 1,
							type: 'number',
							inclusive: true,
							exact: false,
							path: ['quality'],
							message: 'Number must be greater than or equal to 1'
						} as any
					])
				},
	updateSleepEntry: async () =>
		mockUpdateResult !== undefined
			? { success: true, data: mockUpdateResult }
			: {
					success: false,
					error: new ZodError([
						{
							code: 'too_big',
							maximum: 10,
							type: 'number',
							inclusive: true,
							exact: false,
							path: ['quality'],
							message: 'Number must be less than or equal to 10'
						} as any
					])
				},
	deleteSleepEntry: async () => mockDeleteResult
}));

const sleepModule = await import('../../src/routes/api/sleep/+server');
const sleepIdModule = await import('../../src/routes/api/sleep/[id]/+server');

describe('api/sleep', () => {
	beforeEach(() => {
		mockGetEntriesResult = [];
		mockGetByRangeResult = [];
		mockCreateResult = null;
		mockUpdateResult = undefined;
		mockDeleteResult = false;
	});

	describe('GET /api/sleep', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({ user: null });
			const response = await sleepModule.GET(event);
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('returns entries for authenticated user', async () => {
			mockGetEntriesResult = [TEST_SLEEP_ENTRY];
			const event = createMockEvent({ user: TEST_USER });
			const response = await sleepModule.GET(event);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.entries).toHaveLength(1);
			expect(data.entries[0].entryDate).toBe('2026-03-01');
		});

		test('returns empty array when no entries', async () => {
			mockGetEntriesResult = [];
			const event = createMockEvent({ user: TEST_USER });
			const response = await sleepModule.GET(event);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.entries).toEqual([]);
		});

		test('returns entries filtered by date range', async () => {
			mockGetByRangeResult = [TEST_SLEEP_ENTRY];
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { from: '2026-03-01', to: '2026-03-31' }
			});
			const response = await sleepModule.GET(event);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.entries).toHaveLength(1);
		});

		test('returns 400 for invalid from date format', async () => {
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { from: '01-03-2026', to: '2026-03-31' }
			});
			const response = await sleepModule.GET(event);
			const data = await response.json();
			expect(response.status).toBe(400);
			expect(data.error).toContain('date');
		});

		test('returns 400 for invalid to date format', async () => {
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { from: '2026-03-01', to: 'not-a-date' }
			});
			const response = await sleepModule.GET(event);
			const data = await response.json();
			expect(response.status).toBe(400);
		});

		test('uses full list when only from param provided', async () => {
			mockGetEntriesResult = [TEST_SLEEP_ENTRY];
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { from: '2026-03-01' }
			});
			const response = await sleepModule.GET(event);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.entries).toHaveLength(1);
		});
	});

	describe('POST /api/sleep', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({
				user: null,
				body: { durationMinutes: 480, quality: 8, entryDate: '2026-03-01' }
			});
			const response = await sleepModule.POST(event);
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('creates entry and returns 201', async () => {
			mockCreateResult = TEST_SLEEP_ENTRY;
			const event = createMockEvent({
				user: TEST_USER,
				body: { durationMinutes: 480, quality: 8, entryDate: '2026-03-01' }
			});
			const response = await sleepModule.POST(event);
			const data = await response.json();
			expect(response.status).toBe(201);
			expect(data.entry.durationMinutes).toBe(480);
			expect(data.entry.quality).toBe(8);
		});

		test('returns 400 for invalid quality', async () => {
			mockCreateResult = null;
			const event = createMockEvent({
				user: TEST_USER,
				body: { durationMinutes: 480, quality: 0, entryDate: '2026-03-01' }
			});
			const response = await sleepModule.POST(event);
			expect(response.status).toBe(400);
		});

		test('returns 400 for quality > 10', async () => {
			mockCreateResult = null;
			const event = createMockEvent({
				user: TEST_USER,
				body: { durationMinutes: 480, quality: 11, entryDate: '2026-03-01' }
			});
			const response = await sleepModule.POST(event);
			expect(response.status).toBe(400);
		});

		test('accepts optional bedtime field', async () => {
			mockCreateResult = {
				...TEST_SLEEP_ENTRY,
				bedtime: new Date('2026-02-28T22:00:00Z'),
				wakeTime: new Date('2026-03-01T06:00:00Z'),
				wakeUps: 1,
				notes: 'Good sleep'
			};
			const event = createMockEvent({
				user: TEST_USER,
				body: {
					durationMinutes: 480,
					quality: 8,
					entryDate: '2026-03-01',
					bedtime: '2026-02-28T22:00:00.000Z',
					wakeTime: '2026-03-01T06:00:00.000Z',
					wakeUps: 1,
					notes: 'Good sleep'
				}
			});
			const response = await sleepModule.POST(event);
			const data = await response.json();
			expect(response.status).toBe(201);
			expect(data.entry.wakeUps).toBe(1);
			expect(data.entry.notes).toBe('Good sleep');
		});
	});

	describe('PATCH /api/sleep/:id', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({
				user: null,
				params: { id: TEST_SLEEP_ENTRY.id },
				body: { quality: 7 }
			});
			const response = await sleepIdModule.PATCH(event);
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('updates entry and returns 200', async () => {
			mockUpdateResult = { ...TEST_SLEEP_ENTRY, quality: 7, durationMinutes: 420 };
			const event = createMockEvent({
				user: TEST_USER,
				params: { id: TEST_SLEEP_ENTRY.id },
				body: { quality: 7, durationMinutes: 420 }
			});
			const response = await sleepIdModule.PATCH(event);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.entry.quality).toBe(7);
		});

		test('returns 404 when entry not found', async () => {
			mockUpdateResult = null;
			const event = createMockEvent({
				user: TEST_USER,
				params: { id: '00000000-0000-4000-8000-000000000000' },
				body: { quality: 7 }
			});
			const response = await sleepIdModule.PATCH(event);
			const data = await response.json();
			expect(response.status).toBe(404);
			expect(data.error).toContain('Sleep entry');
		});
	});

	describe('DELETE /api/sleep/:id', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({
				user: null,
				params: { id: TEST_SLEEP_ENTRY.id }
			});
			const response = await sleepIdModule.DELETE(event);
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('deletes entry and returns 204', async () => {
			mockDeleteResult = true;
			const event = createMockEvent({
				user: TEST_USER,
				params: { id: TEST_SLEEP_ENTRY.id }
			});
			const response = await sleepIdModule.DELETE(event);
			expect(response.status).toBe(204);
		});

		test('returns 404 when entry not found', async () => {
			mockDeleteResult = false;
			const event = createMockEvent({
				user: TEST_USER,
				params: { id: '00000000-0000-4000-8000-000000000000' }
			});
			const response = await sleepIdModule.DELETE(event);
			const data = await response.json();
			expect(response.status).toBe(404);
			expect(data.error).toContain('Sleep entry');
		});
	});
});
