import { describe, test, expect, beforeEach, vi } from 'vitest';
import { ZodError } from 'zod';
import { createMockEvent } from '../helpers/mock-request-event';
import { expectResponseContract } from '../helpers/contract';
import { TEST_USER } from '../helpers/fixtures';

const TEST_REMINDER = {
	id: '10000000-0000-4000-8000-0000000000a0',
	userId: TEST_USER.id,
	kind: 'weight' as const,
	mealType: null,
	time: '08:00',
	weekdays: [1, 2, 3, 4, 5, 6, 0],
	enabled: true,
	createdAt: new Date('2026-01-01T00:00:00Z'),
	updatedAt: new Date('2026-01-01T00:00:00Z')
};

let mockListResult: any[] = [];
let mockGetByIdResult: any = null;
let mockCreateResult: any = null;
let mockUpdateResult: any = undefined;
let mockDeleteError: Error | null = null;

const mockValidationError = new ZodError([
	{ code: 'invalid_type', expected: 'string', path: ['kind'], message: 'Required' } as any
]);

vi.mock('$lib/server/reminders', () => ({
	listReminders: async () => mockListResult,
	getReminderById: async () => mockGetByIdResult,
	createReminder: async () =>
		mockCreateResult
			? { success: true, data: mockCreateResult }
			: { success: false, error: mockValidationError },
	updateReminder: async () =>
		mockUpdateResult !== undefined
			? { success: true, data: mockUpdateResult }
			: { success: false, error: mockValidationError },
	deleteReminder: async () => {
		if (mockDeleteError) throw mockDeleteError;
	}
}));

vi.mock('$lib/server/sync/conflict', async (importOriginal) => {
	const original = await importOriginal<typeof import('$lib/server/sync/conflict')>();
	return { ...original, isStaleDelete: async () => false };
});

const remindersModule = await import('../../src/routes/api/reminders/+server');
const reminderIdModule = await import('../../src/routes/api/reminders/[id]/+server');

describe('api/reminders', () => {
	beforeEach(() => {
		mockListResult = [];
		mockGetByIdResult = null;
		mockCreateResult = null;
		mockUpdateResult = undefined;
		mockDeleteError = null;
	});

	describe('GET /api/reminders', () => {
		test('returns 401 when not authenticated', async () => {
			const response = await remindersModule.GET(createMockEvent({ user: null }));
			await expectResponseContract('GET', '/api/reminders', response);
			expect(response.status).toBe(401);
		});

		test('lists reminders for the user', async () => {
			mockListResult = [TEST_REMINDER];
			const response = await remindersModule.GET(createMockEvent({ user: TEST_USER }));
			await expectResponseContract('GET', '/api/reminders', response);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.reminders).toHaveLength(1);
		});
	});

	describe('POST /api/reminders', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({ user: null, body: { kind: 'weight', time: '08:00' } });
			const response = await remindersModule.POST(event);
			await expectResponseContract('POST', '/api/reminders', response);
			expect(response.status).toBe(401);
		});

		test('creates a reminder', async () => {
			mockCreateResult = TEST_REMINDER;
			const event = createMockEvent({
				user: TEST_USER,
				body: { kind: 'weight', time: '08:00', weekdays: [1, 2, 3, 4, 5] }
			});
			const response = await remindersModule.POST(event);
			await expectResponseContract('POST', '/api/reminders', response);
			expect(response.status).toBe(201);
		});

		test('returns 400 for an invalid payload', async () => {
			mockCreateResult = null;
			const event = createMockEvent({ user: TEST_USER, body: {} });
			const response = await remindersModule.POST(event);
			// Not asserted: details is ZodError#format()'s recursive tree, which validationErrorResponseSchema can't describe without oasdiff flagging a breaking change (see shared.ts).
			expect(response.status).toBe(400);
		});
	});

	describe('GET /api/reminders/:id', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({ user: null, params: { id: TEST_REMINDER.id } });
			const response = await reminderIdModule.GET(event);
			await expectResponseContract('GET', '/api/reminders/{id}', response);
			expect(response.status).toBe(401);
		});

		test('returns the reminder when found', async () => {
			mockGetByIdResult = TEST_REMINDER;
			const event = createMockEvent({ user: TEST_USER, params: { id: TEST_REMINDER.id } });
			const response = await reminderIdModule.GET(event);
			await expectResponseContract('GET', '/api/reminders/{id}', response);
			expect(response.status).toBe(200);
		});

		test('returns 404 when not found', async () => {
			mockGetByIdResult = null;
			const event = createMockEvent({
				user: TEST_USER,
				params: { id: '00000000-0000-0000-0000-000000000000' }
			});
			const response = await reminderIdModule.GET(event);
			await expectResponseContract('GET', '/api/reminders/{id}', response);
			expect(response.status).toBe(404);
		});
	});

	describe('PATCH /api/reminders/:id', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({
				user: null,
				params: { id: TEST_REMINDER.id },
				body: { enabled: false }
			});
			const response = await reminderIdModule.PATCH(event);
			await expectResponseContract('PATCH', '/api/reminders/{id}', response);
			expect(response.status).toBe(401);
		});

		test('updates the reminder', async () => {
			mockUpdateResult = { ...TEST_REMINDER, enabled: false };
			const event = createMockEvent({
				user: TEST_USER,
				params: { id: TEST_REMINDER.id },
				body: { enabled: false }
			});
			const response = await reminderIdModule.PATCH(event);
			await expectResponseContract('PATCH', '/api/reminders/{id}', response);
			expect(response.status).toBe(200);
		});

		test('returns 404 when not found', async () => {
			mockUpdateResult = null;
			const event = createMockEvent({
				user: TEST_USER,
				params: { id: '00000000-0000-0000-0000-000000000000' },
				body: { enabled: false }
			});
			const response = await reminderIdModule.PATCH(event);
			await expectResponseContract('PATCH', '/api/reminders/{id}', response);
			expect(response.status).toBe(404);
		});
	});

	describe('DELETE /api/reminders/:id', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({ user: null, params: { id: TEST_REMINDER.id } });
			const response = await reminderIdModule.DELETE(event);
			await expectResponseContract('DELETE', '/api/reminders/{id}', response);
			expect(response.status).toBe(401);
		});

		test('deletes the reminder', async () => {
			const event = createMockEvent({ user: TEST_USER, params: { id: TEST_REMINDER.id } });
			const response = await reminderIdModule.DELETE(event);
			await expectResponseContract('DELETE', '/api/reminders/{id}', response);
			expect(response.status).toBe(204);
		});
	});
});
