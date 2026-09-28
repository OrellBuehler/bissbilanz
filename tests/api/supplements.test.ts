import { describe, test, expect, beforeEach, vi } from 'vitest';
import { ZodError } from 'zod';
import { createMockEvent } from '../helpers/mock-request-event';
import { expectResponseContract } from '../helpers/contract';
import { TEST_USER, TEST_SUPPLEMENT, VALID_SUPPLEMENT_PAYLOAD } from '../helpers/fixtures';

// Replacement for the old TEST_SUPPLEMENT_LOG — supplement logs are now derived
// from food_entries, so the API returns a { supplementId, date, takenAt, entryIds } shape.
const TEST_SUPPLEMENT_LOG = {
	supplementId: TEST_SUPPLEMENT.id,
	date: '2026-02-17',
	takenAt: new Date('2026-02-17T08:00:00Z'),
	entryIds: ['10000000-0000-4000-8000-0000000000e1']
};

let mockListResult: any[] = [];
let mockCreateResult: any = null;
let mockGetByIdResult: any = null;
let mockUpdateResult: any = null;
let mockLogResult: any = null;

const mockValidationError = new ZodError([
	{ code: 'invalid_type', expected: 'string', path: ['name'], message: 'Required' } as any
]);

vi.mock('$lib/server/supplements', () => ({
	listSupplements: async () => mockListResult,
	createSupplement: async () =>
		mockCreateResult
			? { success: true, data: mockCreateResult }
			: { success: false, error: mockValidationError },
	getSupplementById: async () => mockGetByIdResult,
	updateSupplement: async () =>
		mockUpdateResult !== undefined
			? { success: true, data: mockUpdateResult }
			: { success: false, error: mockValidationError },
	deleteSupplement: async () => true,
	logSupplement: async () =>
		mockLogResult
			? { success: true, data: mockLogResult }
			: { success: false, error: new Error('Supplement not found') },
	getLogsForDate: async () => [],
	getSupplementIngredients: async () => [],
	getIngredientsForSupplements: async () => [],
	unlogSupplement: async () => {},
	getLogsForRange: async () => [],
	getSupplementChecklist: async () =>
		mockListResult.map((s: any) => ({ supplement: s, taken: false, takenAt: null }))
}));

vi.mock('$lib/utils/supplements', () => ({
	isSupplementDue: () => true,
	formatSchedule: () => ''
}));

vi.mock('$lib/utils/dates', async () => {
	const real = await vi.importActual<typeof import('$lib/utils/dates')>('$lib/utils/dates');
	return {
		...real,
		today: () => '2026-02-27'
	};
});

// Supplement routes resolve "today" in the user's stored timezone.
vi.mock('$lib/server/preferences', () => ({
	getUserTimeZone: async () => 'UTC'
}));

import { allValidationSchemas } from '../helpers/mock-validation';
vi.mock('$lib/server/validation', () => ({
	...allValidationSchemas,
	supplementLogSchema: {
		safeParse: (data: any) => ({ success: true, data: data ?? {} })
	}
}));

const supplementsModule = await import('../../src/routes/api/supplements/+server');
const supplementIdModule = await import('../../src/routes/api/supplements/[id]/+server');
const supplementLogModule = await import('../../src/routes/api/supplements/[id]/log/+server');
const supplementTodayModule = await import('../../src/routes/api/supplements/today/+server');
const supplementHistoryModule = await import('../../src/routes/api/supplements/history/+server');
const supplementChecklistModule =
	await import('../../src/routes/api/supplements/[date]/checklist/+server');

describe('api/supplements', () => {
	beforeEach(() => {
		mockListResult = [];
		mockCreateResult = null;
		mockGetByIdResult = null;
		mockUpdateResult = undefined;
		mockLogResult = null;
	});

	describe('GET /api/supplements', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({ user: null });
			const response = await supplementsModule.GET(event);
			await expectResponseContract('GET', '/api/supplements', response);
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('returns supplements for user', async () => {
			mockListResult = [TEST_SUPPLEMENT];
			const event = createMockEvent({ user: TEST_USER });
			const response = await supplementsModule.GET(event);
			await expectResponseContract('GET', '/api/supplements', response);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.supplements).toHaveLength(1);
			expect(data.supplements[0].name).toBe('Vitamin D3');
		});

		test('returns empty array when no supplements', async () => {
			const event = createMockEvent({ user: TEST_USER });
			const response = await supplementsModule.GET(event);
			await expectResponseContract('GET', '/api/supplements', response);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.supplements).toEqual([]);
		});
	});

	describe('POST /api/supplements', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({
				user: null,
				body: VALID_SUPPLEMENT_PAYLOAD
			});
			const response = await supplementsModule.POST(event);
			await expectResponseContract('POST', '/api/supplements', response);
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('creates supplement with valid payload', async () => {
			mockCreateResult = TEST_SUPPLEMENT;
			const event = createMockEvent({
				user: TEST_USER,
				body: VALID_SUPPLEMENT_PAYLOAD
			});
			const response = await supplementsModule.POST(event);
			await expectResponseContract('POST', '/api/supplements', response);
			const data = await response.json();
			expect(response.status).toBe(201);
			expect(data.supplement.name).toBe('Vitamin D3');
		});

		test('returns 400 for invalid payload', async () => {
			mockCreateResult = null;
			const event = createMockEvent({
				user: TEST_USER,
				body: {}
			});
			const response = await supplementsModule.POST(event);
			// Not asserted: details is ZodError#format()'s recursive tree, which validationErrorResponseSchema can't describe without oasdiff flagging a breaking change (see shared.ts).
			expect(response.status).toBe(400);
		});
	});

	describe('GET /api/supplements/:id', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({
				user: null,
				params: { id: TEST_SUPPLEMENT.id }
			});
			const response = await supplementIdModule.GET(event);
			await expectResponseContract('GET', '/api/supplements/{id}', response);
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('returns supplement when found', async () => {
			mockGetByIdResult = TEST_SUPPLEMENT;
			const event = createMockEvent({
				user: TEST_USER,
				params: { id: TEST_SUPPLEMENT.id }
			});
			const response = await supplementIdModule.GET(event);
			await expectResponseContract('GET', '/api/supplements/{id}', response);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.supplement.name).toBe('Vitamin D3');
		});

		test('returns 404 when not found', async () => {
			mockGetByIdResult = null;
			const event = createMockEvent({
				user: TEST_USER,
				params: { id: '00000000-0000-0000-0000-000000000000' }
			});
			const response = await supplementIdModule.GET(event);
			await expectResponseContract('GET', '/api/supplements/{id}', response);
			const data = await response.json();
			expect(response.status).toBe(404);
			expect(data.error).toBe('Supplement not found');
		});
	});

	describe('PUT /api/supplements/:id', () => {
		test('updates supplement with valid payload', async () => {
			mockUpdateResult = { ...TEST_SUPPLEMENT, name: 'Updated D3' };
			const event = createMockEvent({
				user: TEST_USER,
				params: { id: TEST_SUPPLEMENT.id },
				body: { name: 'Updated D3' }
			});
			const response = await supplementIdModule.PATCH(event);
			await expectResponseContract('PATCH', '/api/supplements/{id}', response);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.supplement.name).toBe('Updated D3');
		});

		test('returns 404 when supplement not found', async () => {
			mockUpdateResult = null;
			const event = createMockEvent({
				user: TEST_USER,
				params: { id: '00000000-0000-0000-0000-000000000000' },
				body: { name: 'Updated' }
			});
			const response = await supplementIdModule.PATCH(event);
			await expectResponseContract('PATCH', '/api/supplements/{id}', response);
			const data = await response.json();
			expect(response.status).toBe(404);
			expect(data.error).toBe('Supplement not found');
		});
	});

	describe('DELETE /api/supplements/:id', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({
				user: null,
				params: { id: TEST_SUPPLEMENT.id }
			});
			const response = await supplementIdModule.DELETE(event);
			await expectResponseContract('DELETE', '/api/supplements/{id}', response);
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('deletes supplement', async () => {
			const event = createMockEvent({
				user: TEST_USER,
				params: { id: TEST_SUPPLEMENT.id }
			});
			const response = await supplementIdModule.DELETE(event);
			await expectResponseContract('DELETE', '/api/supplements/{id}', response);
			expect(response.status).toBe(204);
		});
	});

	describe('POST /api/supplements/:id/log', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({
				user: null,
				params: { id: TEST_SUPPLEMENT.id },
				body: {}
			});
			const response = await supplementLogModule.POST(event);
			await expectResponseContract('POST', '/api/supplements/{id}/log', response);
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('logs supplement for today', async () => {
			mockLogResult = TEST_SUPPLEMENT_LOG;
			const event = createMockEvent({
				user: TEST_USER,
				params: { id: TEST_SUPPLEMENT.id },
				body: {}
			});
			const response = await supplementLogModule.POST(event);
			await expectResponseContract('POST', '/api/supplements/{id}/log', response);
			const data = await response.json();
			expect(response.status).toBe(201);
			expect(data.log).toBeDefined();
		});

		test('returns 404 when supplement not found', async () => {
			mockLogResult = null;
			const event = createMockEvent({
				user: TEST_USER,
				params: { id: '00000000-0000-0000-0000-000000000000' },
				body: {}
			});
			const response = await supplementLogModule.POST(event);
			await expectResponseContract('POST', '/api/supplements/{id}/log', response);
			const data = await response.json();
			expect(response.status).toBe(404);
			expect(data.error).toBe('Supplement not found');
		});
	});

	describe('GET /api/supplements/today', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({ user: null });
			const response = await supplementTodayModule.GET(event);
			await expectResponseContract('GET', '/api/supplements/today', response);
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('returns checklist for today', async () => {
			mockListResult = [TEST_SUPPLEMENT];
			const event = createMockEvent({ user: TEST_USER });
			const response = await supplementTodayModule.GET(event);
			await expectResponseContract('GET', '/api/supplements/today', response);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.checklist).toBeDefined();
			expect(data.date).toBeDefined();
		});
	});

	describe('GET /api/supplements/history', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({
				user: null,
				searchParams: { from: '2026-02-01', to: '2026-02-27' }
			});
			const response = await supplementHistoryModule.GET(event);
			await expectResponseContract('GET', '/api/supplements/history', response);
			expect(response.status).toBe(401);
		});

		test('returns the log history for the range', async () => {
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { from: '2026-02-01', to: '2026-02-27' }
			});
			const response = await supplementHistoryModule.GET(event);
			await expectResponseContract('GET', '/api/supplements/history', response);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.history).toEqual([]);
		});

		test('returns 400 when from/to are missing', async () => {
			const event = createMockEvent({ user: TEST_USER });
			const response = await supplementHistoryModule.GET(event);
			await expectResponseContract('GET', '/api/supplements/history', response);
			expect(response.status).toBe(400);
		});
	});

	describe('GET /api/supplements/:date/checklist', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({ user: null, params: { date: '2026-02-27' } });
			const response = await supplementChecklistModule.GET(event);
			await expectResponseContract('GET', '/api/supplements/{date}/checklist', response);
			expect(response.status).toBe(401);
		});

		test('returns the checklist for the date', async () => {
			mockListResult = [TEST_SUPPLEMENT];
			const event = createMockEvent({ user: TEST_USER, params: { date: '2026-02-27' } });
			const response = await supplementChecklistModule.GET(event);
			await expectResponseContract('GET', '/api/supplements/{date}/checklist', response);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.date).toBe('2026-02-27');
		});
	});
});
