import type { RequestEvent } from '@sveltejs/kit';
import { createMockEvent } from './mock-request-event';
import { TEST_USER } from './fixtures';

export const ADMIN_USER = { ...TEST_USER, isAdmin: true };

export const SESSION = { id: 'session-1' } as NonNullable<App.Locals['session']>;

type AdminEventOptions = Omit<Parameters<typeof createMockEvent>[0] & object, 'user'> & {
	as?: 'admin' | 'user' | 'bearer-admin' | 'anonymous';
};

export function adminEvent({ as = 'admin', ...options }: AdminEventOptions = {}): RequestEvent<
	any,
	any
> {
	const event = createMockEvent({ ...options, user: as === 'anonymous' ? null : ADMIN_USER });
	switch (as) {
		case 'admin':
			event.locals.session = SESSION;
			break;
		case 'user':
			event.locals.user = TEST_USER;
			event.locals.session = SESSION;
			break;
		case 'bearer-admin':
			event.locals.session = SESSION;
			event.locals.tokenScopes = ['mcp:access', 'account:manage'];
			break;
	}
	return event;
}
