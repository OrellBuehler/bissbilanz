import { describe, test, expect, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { createMockEvent } from '../helpers/mock-request-event';
import { ADMIN_USER } from '../helpers/admin';

const TEST_TOKEN = 'admin-bearer-test-token';

const getUserById = vi.hoisted(() => vi.fn());

vi.hoisted(() => {
	process.env.TEST_MODE = 'true';
	process.env.TEST_AUTH_TOKEN = 'admin-bearer-test-token';
	process.env.TEST_USER_ID = '10000000-0000-4000-8000-000000000001';
});

vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('@sveltejs/kit/hooks', () => {
	type Resolve = (event: RequestEvent) => Promise<Response>;
	type Handler = (input: { event: RequestEvent; resolve: Resolve }) => Promise<Response>;
	return {
		sequence:
			(...handlers: Handler[]): Handler =>
			({ event, resolve }) => {
				const run = (index: number, current: RequestEvent): Promise<Response> =>
					index === handlers.length
						? resolve(current)
						: handlers[index]({ event: current, resolve: (next) => run(index + 1, next) });
				return run(0, event);
			}
	};
});
vi.mock('$lib/paraglide/server', () => ({
	paraglideMiddleware: (
		request: Request,
		resolve: (args: { request: Request; locale: string }) => Promise<Response>
	) => resolve({ request, locale: 'en' })
}));
vi.mock('@sentry/sveltekit', async (importOriginal) => ({
	...(await importOriginal<typeof import('@sentry/sveltekit')>()),
	sentryHandle:
		() =>
		({
			event,
			resolve
		}: {
			event: RequestEvent;
			resolve: (e: RequestEvent) => Promise<Response>;
		}) =>
			resolve(event)
}));
vi.mock('$lib/server/db', () => ({
	getDB: () => ({}),
	runMigrations: async () => {},
	withDbRetry: <T>(fn: () => Promise<T>) => fn()
}));
vi.mock('$lib/server/session', () => ({
	getSessionWithUser: async () => null,
	getUserById,
	cleanExpiredSessions: async () => {}
}));
vi.mock('$lib/server/oauth', () => ({
	validateAccessToken: async () => null,
	cleanupExpiredOAuthData: async () => {}
}));

const { handle } = await import('../../src/hooks.server');
const adminUsers = await import('../../src/routes/api/admin/users/+server');
const adminClaude = await import('../../src/routes/api/admin/claude/+server');

function request(pathname: string, method = 'GET') {
	const event = createMockEvent({
		method,
		url: `http://localhost:5173${pathname}`,
		headers: { authorization: `Bearer ${TEST_TOKEN}` },
		body: method === 'GET' ? undefined : { enabled: true }
	});
	event.route = { id: pathname };
	return event;
}

describe('admin API with a bearer token (real hooks)', () => {
	test('an admin user over the test bearer token gets a 404 from /api/admin/users', async () => {
		getUserById.mockResolvedValue(ADMIN_USER);
		const event = request('/api/admin/users');
		let reachedHandler = false;

		const response = await handle({
			event,
			resolve: async (resolved) => {
				reachedHandler = true;
				return adminUsers.GET(resolved as never);
			}
		});

		expect(reachedHandler).toBe(true);
		expect(event.locals.user?.isAdmin).toBe(true);
		expect(event.locals.tokenScopes).toBeDefined();
		expect(event.locals.session).toBeUndefined();
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: 'Not found' });
	});

	test('the kill switch route is a 404 too', async () => {
		getUserById.mockResolvedValue(ADMIN_USER);
		const event = request('/api/admin/claude', 'PATCH');

		const response = await handle({
			event,
			resolve: async (resolved) => adminClaude.PATCH(resolved as never)
		});

		expect(response.status).toBe(404);
	});
});
