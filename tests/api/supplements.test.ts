import { describe, test, expect, beforeEach, vi } from 'vitest';
import { ZodError } from 'zod';
import { createMockEvent } from '../helpers/mock-request-event';
import {
	TEST_USER,
	TEST_SUPPLEMENT,
	TEST_SUPPLEMENT_LOG,
	VALID_SUPPLEMENT_PAYLOAD
} from '../helpers/fixtures';

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
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('returns supplements for user', async () => {
			mockListResult = [TEST_SUPPLEMENT];
			const event = createMockEvent({ user: TEST_USER });
			const response = await supplementsModule.GET(event);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.supplements).toHaveLength(1);
			expect(data.supplements[0].name).toBe('Vitamin D3');
		});

		test('returns empty array when no supplements', async () => {
			const event = createMockEvent({ user: TEST_USER });
			const response = await supplementsModule.GET(event);
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
			const data = await response.json();
			expect(response.status).toBe(404);
			expect(data.error).toBe('Supplement not found');
		});
	});

	describe('GET /api/supplements/today', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({ user: null });
			const response = await supplementTodayModule.GET(event);
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('returns checklist for today', async () => {
			mockListResult = [TEST_SUPPLEMENT];
			const event = createMockEvent({ user: TEST_USER });
			const response = await supplementTodayModule.GET(event);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.checklist).toBeDefined();
			expect(data.date).toBeDefined();
		});
	});
});
