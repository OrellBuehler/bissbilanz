import { describe, it, expect, vi } from 'vitest';

const listAuthorizedClients = vi.fn();

vi.mock('$lib/server/oauth', () => ({
	listAuthorizedClients: (...args: unknown[]) => listAuthorizedClients(...args)
}));

import { GET } from './+server';

const call = (userId = 'u1') =>
	GET({
		locals: { user: { id: userId } }
	} as unknown as Parameters<typeof GET>[0]);

describe('GET /api/mcp/status', () => {
	it('reports connected when the user has an authorized client', async () => {
		listAuthorizedClients.mockResolvedValueOnce([
			{
				clientId: 'https://client.example/metadata',
				clientName: 'Some Assistant',
				approvedAt: new Date()
			}
		]);
		const res = await call();
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ connected: true });
	});

	it('reports not connected when the user has no authorized clients', async () => {
		listAuthorizedClients.mockResolvedValueOnce([]);
		const res = await call();
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ connected: false });
	});

	it('401s when unauthenticated', async () => {
		const res = await GET({ locals: {} } as unknown as Parameters<typeof GET>[0]);
		expect(res.status).toBe(401);
		expect(listAuthorizedClients).not.toHaveBeenCalled();
	});
});
