import { describe, expect, test, vi } from 'vitest';
import { expectResponseContract } from '../helpers/contract';

vi.mock('$lib/server/auth-providers', () => ({
	enabledProviderIds: () => ['infomaniak', 'google']
}));

const providersModule = await import('../../src/routes/api/auth/providers/+server');

describe('public providers route', () => {
	test('lists enabled providers without requiring a user', async () => {
		const response = await providersModule.GET({ locals: {} } as any);
		await expectResponseContract('GET', '/api/auth/providers', response);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ providers: ['infomaniak', 'google'] });
	});
});
