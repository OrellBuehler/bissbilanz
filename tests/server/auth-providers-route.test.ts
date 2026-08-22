import { describe, expect, test, vi } from 'vitest';

vi.mock('$lib/server/auth-providers', () => ({
	enabledProviderIds: () => ['infomaniak', 'google']
}));

const providersModule = await import('../../src/routes/api/auth/providers/+server');

describe('public providers route', () => {
	test('lists enabled providers without requiring a user', async () => {
		const response = await providersModule.GET({ locals: {} } as any);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ providers: ['infomaniak', 'google'] });
	});
});
