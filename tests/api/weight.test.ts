import { describe, test, expect, beforeEach, vi } from 'vitest';
import { ZodError } from 'zod';
import { createMockEvent } from '../helpers/mock-request-event';
import { TEST_USER } from '../helpers/fixtures';

const TEST_WEIGHT_ENTRY = {
	id: '10000000-0000-4000-8000-000000000080',
	userId: TEST_USER.id,
	weightKg: 75.5,
	entryDate: '2026-02-10',
	loggedAt: new Date('2026-02-10T08:00:00Z'),
	notes: null,
	updatedAt: null
};

let mockGetEntriesResult: any = [];
let mockGetTrendResult: any = [];
let mockCreateResult: any = null;
let mockLatestResult: any = null;
let mockUpdateResult: any = null;
let mockDeleteResult: any = false;

vi.mock('$lib/server/weight', () => ({
	getWeightEntries: async () => mockGetEntriesResult,
	getWeightWithTrend: async () => mockGetTrendResult,
	createWeightEntry: async (_userId: string, payload: unknown) =>
		mockCreateResult
			? { success: true, data: mockCreateResult }
			: {
					success: false,
					error: new ZodError([
						{
							code: 'invalid_type',
							expected: 'number',
							path: ['weightKg'],
							message: 'Required'
						} as any
					])
				},
	getLatestWeight: async () => mockLatestResult,
	updateWeightEntry: async () =>
		mockUpdateResult !== undefined
			? { success: true, data: mockUpdateResult }
			: {
					success: false,
					error: new ZodError([
						{
							code: 'invalid_type',
							expected: 'number',
							path: ['weightKg'],
							message: 'Required'
						} as any
					])
				},
	deleteWeightEntry: async () => mockDeleteResult
}));

const weightModule = await import('../../src/routes/api/weight/+server');
const weightIdModule = await import('../../src/routes/api/weight/[id]/+server');
const weightLatestModule = await import('../../src/routes/api/weight/latest/+server');

describe('api/weight', () => {
	beforeEach(() => {
		mockGetEntriesResult = [];
		mockGetTrendResult = [];
		mockCreateResult = null;
		mockLatestResult = null;
		mockUpdateResult = undefined;
		mockDeleteResult = false;
	});

	describe('GET /api/weight', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({ user: null });
			const response = await weightModule.GET(event);
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('returns weight entries for user', async () => {
			mockGetEntriesResult = [TEST_WEIGHT_ENTRY];
			const event = createMockEvent({ user: TEST_USER });
			const response = await weightModule.GET(event);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.entries).toHaveLength(1);
			expect(data.entries[0].weightKg).toBe(75.5);
		});

		test('returns empty entries array when no weight data', async () => {
			mockGetEntriesResult = [];
			const event = createMockEvent({ user: TEST_USER });
			const response = await weightModule.GET(event);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.entries).toEqual([]);
		});

		test('returns trend data when from and to params provided', async () => {
			mockGetTrendResult = [
				{ entry_date: '2026-02-01', weight_kg: 75.0, moving_avg: 75.0 },
				{ entry_date: '2026-02-10', weight_kg: 75.5, moving_avg: 75.25 }
			];
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { from: '2026-02-01', to: '2026-02-10' }
			});
			const response = await weightModule.GET(event);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.data).toHaveLength(2);
		});
	});

	describe('POST /api/weight', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({
				user: null,
				body: { weightKg: 75.5, entryDate: '2026-02-10' }
			});
			const response = await weightModule.POST(event);
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('creates weight entry with valid payload', async () => {
			mockCreateResult = TEST_WEIGHT_ENTRY;
			const event = createMockEvent({
				user: TEST_USER,
				body: { weightKg: 75.5, entryDate: '2026-02-10' }
			});
			const response = await weightModule.POST(event);
			const data = await response.json();
			expect(response.status).toBe(201);
			expect(data.entry.weightKg).toBe(75.5);
		});

		test('returns 400 for invalid payload', async () => {
			mockCreateResult = null;
			const event = createMockEvent({
				user: TEST_USER,
				body: { weightKg: -5, entryDate: '2026-02-10' }
			});
			const response = await weightModule.POST(event);
			expect(response.status).toBe(400);
		});

		test('creates entry with notes', async () => {
			mockCreateResult = { ...TEST_WEIGHT_ENTRY, notes: 'Before breakfast' };
			const event = createMockEvent({
				user: TEST_USER,
				body: { weightKg: 75.5, entryDate: '2026-02-10', notes: 'Before breakfast' }
			});
			const response = await weightModule.POST(event);
			const data = await response.json();
			expect(response.status).toBe(201);
			expect(data.entry.notes).toBe('Before breakfast');
		});
	});

	describe('PATCH /api/weight/:id', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({
				user: null,
				params: { id: TEST_WEIGHT_ENTRY.id },
				body: { weightKg: 76.0 }
			});
			const response = await weightIdModule.PATCH(event);
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('updates weight entry', async () => {
			mockUpdateResult = { ...TEST_WEIGHT_ENTRY, weightKg: 76.0 };
			const event = createMockEvent({
				user: TEST_USER,
				params: { id: TEST_WEIGHT_ENTRY.id },
				body: { weightKg: 76.0 }
			});
			const response = await weightIdModule.PATCH(event);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.entry.weightKg).toBe(76.0);
		});

		test('returns 404 when entry not found', async () => {
			mockUpdateResult = null;
			const event = createMockEvent({
				user: TEST_USER,
				params: { id: '00000000-0000-0000-0000-000000000000' },
				body: { weightKg: 76.0 }
			});
			const response = await weightIdModule.PATCH(event);
			const data = await response.json();
			expect(response.status).toBe(404);
			expect(data.error).toBe('Weight entry not found');
		});
	});

	describe('DELETE /api/weight/:id', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({
				user: null,
				params: { id: TEST_WEIGHT_ENTRY.id }
			});
			const response = await weightIdModule.DELETE(event);
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('deletes weight entry', async () => {
			mockDeleteResult = true;
			const event = createMockEvent({
				user: TEST_USER,
				params: { id: TEST_WEIGHT_ENTRY.id }
			});
			const response = await weightIdModule.DELETE(event);
			expect(response.status).toBe(204);
		});

		test('returns 404 when entry not found', async () => {
			mockDeleteResult = false;
			const event = createMockEvent({
				user: TEST_USER,
				params: { id: '00000000-0000-0000-0000-000000000000' }
			});
			const response = await weightIdModule.DELETE(event);
			const data = await response.json();
			expect(response.status).toBe(404);
			expect(data.error).toBe('Weight entry not found');
		});
	});

	describe('GET /api/weight/latest', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({ user: null });
			const response = await weightLatestModule.GET(event);
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('returns latest weight entry', async () => {
			mockLatestResult = TEST_WEIGHT_ENTRY;
			const event = createMockEvent({ user: TEST_USER });
			const response = await weightLatestModule.GET(event);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.entry.weightKg).toBe(75.5);
		});

		test('returns null when no weight entries', async () => {
			mockLatestResult = null;
			const event = createMockEvent({ user: TEST_USER });
			const response = await weightLatestModule.GET(event);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.entry).toBeNull();
		});
	});
});
