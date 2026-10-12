import { describe, expect, test } from 'vitest';
import { isAdminSession, requireAdmin } from '$lib/server/admin/guard';
import { ApiError } from '$lib/server/errors';
import { TEST_USER } from '../helpers/fixtures';

const admin = { ...TEST_USER, isAdmin: true };
const session = { id: 'session-1' } as App.Locals['session'];

function expectNotFound(locals: App.Locals) {
	expect(isAdminSession(locals)).toBe(false);
	try {
		requireAdmin(locals);
		expect.unreachable();
	} catch (error) {
		expect(error).toBeInstanceOf(ApiError);
		expect((error as ApiError).status).toBe(404);
		expect((error as ApiError).message).toBe('Not found');
	}
}

describe('requireAdmin', () => {
	test('no user is a 404', () => {
		expectNotFound({});
		expectNotFound({ session });
	});

	test('non-admin cookie session is a 404', () => {
		expectNotFound({ user: TEST_USER, session });
	});

	test('admin with a bearer token (tokenScopes set) is a 404', () => {
		expectNotFound({ user: admin, tokenScopes: ['mcp:access'] });
		expectNotFound({ user: admin, session, tokenScopes: ['account:manage'] });
		expectNotFound({ user: admin, session, tokenScopes: [] });
	});

	test('admin without a session is a 404', () => {
		expectNotFound({ user: admin });
	});

	test('admin with a cookie session passes and returns the user id', () => {
		const locals: App.Locals = { user: admin, session };
		expect(isAdminSession(locals)).toBe(true);
		expect(requireAdmin(locals)).toBe(admin.id);
	});
});
