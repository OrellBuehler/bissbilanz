import { describe, test, expect, beforeEach, vi } from 'vitest';
import { ZodError } from 'zod';
import { createMockEvent } from '../helpers/mock-request-event';
import { TEST_USER } from '../helpers/fixtures';

const FAST_ID = '10000000-0000-4000-8000-0000000000f1';
const TEST_FAST = {
	id: FAST_ID,
	userId: TEST_USER.id,
	startedAt: new Date('2026-09-04T20:00:00Z'),
	endedAt: new Date('2026-09-05T12:30:00Z'),
	targetHours: 16,
	updatedAt: new Date('2026-09-05T12:30:00Z')
};

let mockListResult: any = [];
let mockUpsertResult: any = undefined;
let mockUpdateResult: any = undefined;
let mockDeleteResult = false;
let mockStaleDelete = false;

const validationError = new ZodError([
	{ code: 'invalid_type', expected: 'string', path: ['startedAt'], message: 'Required' } as any
]);

vi.mock('$lib/server/fasting', () => ({
	listFastingSessions: async () => mockListResult,
	upsertFastingSession: async () =>
		mockUpsertResult !== null
			? { success: true, data: mockUpsertResult }
			: { success: false, error: validationError },
	updateFastingSession: async () =>
		mockUpdateResult !== null
			? { success: true, data: mockUpdateResult }
			: { success: false, error: validationError },
	deleteFastingSession: async () => mockDeleteResult
}));

vi.mock('$lib/server/sync/conflict', async (importOriginal) => {
	const original = await importOriginal<typeof import('$lib/server/sync/conflict')>();
	return { ...original, isStaleDelete: async () => mockStaleDelete };
});

const fastsModule = await import('../../src/routes/api/fasts/+server');
const fastsIdModule = await import('../../src/routes/api/fasts/[id]/+server');

describe('api/fasts', () => {
	beforeEach(() => {
		mockListResult = [];
		mockUpsertResult = undefined;
		mockUpdateResult = undefined;
		mockDeleteResult = false;
		mockStaleDelete = false;
	});

	describe('GET /api/fasts', () => {
		test('returns 401 when not authenticated', async () => {
			const response = await fastsModule.GET(createMockEvent({ user: null }));
			expect(response.status).toBe(401);
		});

		test('returns sessions for user', async () => {
			mockListResult = [TEST_FAST];
			const response = await fastsModule.GET(createMockEvent({ user: TEST_USER }));
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.sessions).toHaveLength(1);
			expect(data.sessions[0].targetHours).toBe(16);
		});
	});

	describe('POST /api/fasts', () => {
		test('returns 401 when not authenticated', async () => {
			const response = await fastsModule.POST(
				createMockEvent({ user: null, body: { startedAt: '', endedAt: '', targetHours: 16 } })
			);
			expect(response.status).toBe(401);
		});

		test('upserts a session with 201', async () => {
			mockUpsertResult = TEST_FAST;
			const response = await fastsModule.POST(
				createMockEvent({
					user: TEST_USER,
					body: {
						id: FAST_ID,
						startedAt: '2026-09-04T20:00:00Z',
						endedAt: '2026-09-05T12:30:00Z',
						targetHours: 16
					}
				})
			);
			const data = await response.json();
			expect(response.status).toBe(201);
			expect(data.session.id).toBe(FAST_ID);
		});

		test('returns 400 for invalid payload', async () => {
			mockUpsertResult = null;
			const response = await fastsModule.POST(
				createMockEvent({ user: TEST_USER, body: { targetHours: 16 } })
			);
			expect(response.status).toBe(400);
		});

		test('returns 409 when a stale offline upload loses last-write-wins', async () => {
			mockUpsertResult = undefined;
			const response = await fastsModule.POST(
				createMockEvent({
					user: TEST_USER,
					headers: { 'X-Client-Edited-At': '2026-09-01T00:00:00Z' },
					body: {
						id: FAST_ID,
						startedAt: '2026-09-04T20:00:00Z',
						endedAt: '2026-09-05T12:30:00Z',
						targetHours: 16
					}
				})
			);
			expect(response.status).toBe(409);
		});
	});

	describe('PATCH /api/fasts/[id]', () => {
		test('updates a session', async () => {
			mockUpdateResult = { ...TEST_FAST, targetHours: 18 };
			const response = await fastsIdModule.PATCH(
				createMockEvent({
					user: TEST_USER,
					params: { id: FAST_ID },
					method: 'PATCH',
					body: { targetHours: 18 }
				})
			);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.session.targetHours).toBe(18);
		});

		test('returns 404 when the session does not exist', async () => {
			mockUpdateResult = undefined;
			const response = await fastsIdModule.PATCH(
				createMockEvent({
					user: TEST_USER,
					params: { id: FAST_ID },
					method: 'PATCH',
					body: { targetHours: 18 }
				})
			);
			expect(response.status).toBe(404);
		});

		test('returns 400 for a malformed id', async () => {
			const response = await fastsIdModule.PATCH(
				createMockEvent({
					user: TEST_USER,
					params: { id: 'nope' },
					method: 'PATCH',
					body: { targetHours: 18 }
				})
			);
			expect(response.status).toBe(400);
		});
	});

	describe('DELETE /api/fasts/[id]', () => {
		test('returns 204 on delete', async () => {
			mockDeleteResult = true;
			const response = await fastsIdModule.DELETE(
				createMockEvent({ user: TEST_USER, params: { id: FAST_ID }, method: 'DELETE' })
			);
			expect(response.status).toBe(204);
		});

		test('returns 404 when nothing was deleted', async () => {
			const response = await fastsIdModule.DELETE(
				createMockEvent({ user: TEST_USER, params: { id: FAST_ID }, method: 'DELETE' })
			);
			expect(response.status).toBe(404);
		});

		test('returns 409 for a stale offline delete', async () => {
			mockStaleDelete = true;
			const response = await fastsIdModule.DELETE(
				createMockEvent({
					user: TEST_USER,
					params: { id: FAST_ID },
					method: 'DELETE',
					headers: { 'X-Client-Edited-At': '2026-09-01T00:00:00Z' }
				})
			);
			expect(response.status).toBe(409);
		});
	});
});
