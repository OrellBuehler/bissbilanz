import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { createMockEvent } from '../helpers/mock-request-event';

vi.mock('$app/env/public', () => ({ PUBLIC_SENTRY_DSN: '', PUBLIC_SENTRY_ENVIRONMENT: '' }));
vi.mock('$lib/paraglide/server', () => ({
	paraglideMiddleware: (
		request: Request,
		resolve: (args: { request: Request; locale: string }) => Promise<Response>
	) => resolve({ request, locale: 'en' })
}));
vi.mock('$lib/server/db', () => ({
	getDB: () => ({}),
	runMigrations: async () => {},
	withDbRetry: <T>(fn: () => Promise<T>) => fn()
}));
vi.mock('$lib/server/session', () => ({
	getSessionWithUser: async () => null,
	getUserById: async () => null,
	cleanExpiredSessions: async () => {}
}));
vi.mock('$lib/server/oauth', () => ({
	validateAccessToken: async () => null,
	cleanupExpiredOAuthData: async () => {}
}));

const { handleError } = await import('../../src/hooks.server');

type Input = Parameters<typeof handleError>[0];

const event = createMockEvent({ url: 'http://localhost:5173/api/nope' }) as RequestEvent;

describe('handleError', () => {
	const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

	beforeEach(() => {
		consoleError.mockClear();
	});

	afterEach(() => {
		consoleError.mockClear();
	});

	test('logs the stack of an error our own code threw', async () => {
		const error = new Error('boom');

		await handleError({
			kind: 'unknown',
			error,
			event,
			status: 500,
			message: 'Internal Error'
		} as Input);

		expect(consoleError).toHaveBeenCalledWith(error.stack);
	});

	test('does not log a framework 404 for an unmatched route', async () => {
		await handleError({
			kind: 'framework',
			error: { status: 404, message: 'Not Found' },
			event,
			status: 404,
			message: 'Not Found'
		} as Input);

		expect(consoleError).not.toHaveBeenCalled();
	});

	test('does not log an error thrown with the error helper', async () => {
		await handleError({
			kind: 'app',
			error: { message: 'Forbidden' },
			event,
			status: 403,
			message: 'Forbidden'
		} as Input);

		expect(consoleError).not.toHaveBeenCalled();
	});
});
