import { beforeEach, describe, expect, test, vi } from 'vitest';

const sentry = vi.hoisted(() => ({
	captureException: vi.fn(),
	flush: vi.fn(async () => true)
}));
const runMigrations = vi.hoisted(() => vi.fn(async () => {}));

vi.mock('@sentry/sveltekit', async (importOriginal) => ({
	...(await importOriginal<typeof import('@sentry/sveltekit')>()),
	captureException: sentry.captureException,
	flush: sentry.flush
}));
vi.mock('$app/env/public', () => ({ PUBLIC_SENTRY_DSN: '', PUBLIC_SENTRY_ENVIRONMENT: '' }));
vi.mock('$lib/paraglide/server', () => ({
	paraglideMiddleware: (
		request: Request,
		resolve: (args: { request: Request; locale: string }) => Promise<Response>
	) => resolve({ request, locale: 'en' })
}));
vi.mock('$lib/server/db', () => ({
	getDB: () => ({}),
	runMigrations,
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
vi.mock('$lib/server/mobile-auth', () => ({
	ensureMobileClient: async () => {
		throw new Error('database is unreachable');
	}
}));

const { init } = await import('../../src/hooks.server');

describe('init', () => {
	const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

	beforeEach(() => {
		sentry.captureException.mockClear();
		sentry.flush.mockClear();
		runMigrations.mockClear();
		consoleError.mockClear();
	});

	test('reports and flushes an invalid environment before failing', async () => {
		vi.stubEnv('SESSION_SECRET', 'too-short');
		await expect(init()).rejects.toThrow('Invalid environment configuration');
		vi.unstubAllEnvs();

		expect(sentry.captureException).toHaveBeenCalledWith(
			expect.objectContaining({ message: expect.stringContaining('SESSION_SECRET') }),
			{ tags: { job: 'startup' } }
		);
		expect(sentry.flush).toHaveBeenCalledWith(2000);
		expect(runMigrations).not.toHaveBeenCalled();
		const captured = sentry.captureException.mock.invocationCallOrder[0];
		expect(sentry.flush.mock.invocationCallOrder[0]).toBeGreaterThan(captured);
	});

	test('reports and flushes a startup step that fails after the migrations', async () => {
		vi.stubEnv('DATABASE_URL', 'postgres://user:pass@localhost:5432/db');
		vi.stubEnv('SESSION_SECRET', 'x'.repeat(40));
		vi.stubEnv('PUBLIC_APP_URL', 'http://localhost:4000');
		vi.stubEnv('INFOMANIAK_CLIENT_ID', 'id');
		vi.stubEnv('INFOMANIAK_CLIENT_SECRET', 'secret');
		vi.stubEnv('INFOMANIAK_REDIRECT_URI', 'http://localhost:4000/oauth/callback');
		await expect(init()).rejects.toThrow('database is unreachable');
		vi.unstubAllEnvs();

		expect(runMigrations).toHaveBeenCalledTimes(1);
		expect(sentry.captureException).toHaveBeenCalledWith(
			expect.objectContaining({ message: 'database is unreachable' }),
			{ tags: { job: 'startup' } }
		);
		expect(sentry.flush).toHaveBeenCalledWith(2000);
	});
});
