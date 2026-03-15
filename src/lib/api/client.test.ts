import { describe, it, expect, vi } from 'vitest';
import createClient from 'openapi-fetch';
import type { paths } from './generated/schema';

describe('typed API client', () => {
	it('builds correct GET request with query params', async () => {
		const mockFetch = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ foods: [], total: 0 }), {
				headers: { 'content-type': 'application/json' }
			})
		);

		const client = createClient<paths>({
			baseUrl: 'http://localhost',
			fetch: mockFetch as unknown as typeof globalThis.fetch
		});
		await client.GET('/api/foods', {
			params: { query: { search: 'banana', limit: 20 } }
		});

		expect(mockFetch).toHaveBeenCalledOnce();
		const [request] = mockFetch.mock.calls[0];
		expect(request.url).toContain('/api/foods');
		expect(request.url).toContain('search=banana');
		expect(request.url).toContain('limit=20');
	});

	it('builds correct POST request with body', async () => {
		const mockFetch = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ goals: {} }), {
				headers: { 'content-type': 'application/json' }
			})
		);

		const client = createClient<paths>({
			baseUrl: 'http://localhost',
			fetch: mockFetch as unknown as typeof globalThis.fetch
		});
		await client.POST('/api/goals', {
			body: {
				calorieGoal: 2000,
				proteinGoal: 150,
				carbGoal: 200,
				fatGoal: 70,
				fiberGoal: 30
			}
		});

		expect(mockFetch).toHaveBeenCalledOnce();
		const [request] = mockFetch.mock.calls[0];
		expect(request.method).toBe('POST');
	});

	it('handles error responses with typed error', async () => {
		const mockFetch = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ error: 'Unauthorized' }), {
				status: 401,
				headers: { 'content-type': 'application/json' }
			})
		);

		const client = createClient<paths>({
			baseUrl: 'http://localhost',
			fetch: mockFetch as unknown as typeof globalThis.fetch
		});
		const { data, error } = await client.GET('/api/goals');

		expect(data).toBeUndefined();
		expect(error).toEqual({ error: 'Unauthorized' });
	});

	it('handles queued offline responses', async () => {
		const mockFetch = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ queued: true }), {
				status: 200,
				headers: {
					'content-type': 'application/json',
					'x-queued': 'true'
				}
			})
		);

		const client = createClient<paths>({
			baseUrl: 'http://localhost',
			fetch: mockFetch as unknown as typeof globalThis.fetch
		});
		const result = await client.POST('/api/goals', {
			body: {
				calorieGoal: 2000,
				proteinGoal: 150,
				carbGoal: 200,
				fatGoal: 70,
				fiberGoal: 30
			}
		});

		expect(result.response.headers.get('x-queued')).toBe('true');
	});
});
