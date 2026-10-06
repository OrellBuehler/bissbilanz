import { test, expect } from 'bun:test';
import { logPublicIp, lookupPublicIp } from './public-ip';

test('lookupPublicIp returns the trimmed response body', async () => {
	const ip = await lookupPublicIp({
		fetchImpl: async () => new Response('203.0.113.7\n')
	});
	expect(ip).toBe('203.0.113.7');
});

test('logPublicIp prints the ip', async () => {
	const lines: string[] = [];
	await logPublicIp({
		fetchImpl: async () => new Response('203.0.113.7'),
		log: (l) => void lines.push(l)
	});
	expect(lines).toEqual(['[crawler] public IP: 203.0.113.7']);
});

test('logPublicIp warns instead of throwing when the lookup fails', async () => {
	const lines: string[] = [];
	await logPublicIp({
		fetchImpl: async () => {
			throw new Error('offline');
		},
		log: (l) => void lines.push(l)
	});
	await logPublicIp({
		fetchImpl: async () => new Response('nope', { status: 503 }),
		log: (l) => void lines.push(l)
	});
	expect(lines).toHaveLength(2);
	expect(lines[0]).toContain('warning');
	expect(lines[0]).toContain('offline');
	expect(lines[1]).toContain('HTTP 503');
});
