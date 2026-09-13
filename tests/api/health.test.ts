import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createMockDB } from '../helpers/mock-db';

const { db, setResult, setError, reset } = createMockDB();

vi.mock('$lib/server/db', () => ({
	getDB: () => db
}));

const { GET } = await import('../../src/routes/api/health/+server');

describe('api/health', () => {
	beforeEach(() => {
		reset();
	});

	test('returns 200 with status ok and the app version when the database is reachable', async () => {
		setResult([{ '?column?': 1 }]);

		const response = await GET({} as any);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.status).toBe('ok');
		expect(typeof data.version).toBe('string');
	});

	test('returns 503 with status degraded when the database check fails', async () => {
		setError(new Error('connection refused'));

		const response = await GET({} as any);
		const data = await response.json();

		expect(response.status).toBe(503);
		expect(data.status).toBe('degraded');
		expect(data.version).toBeUndefined();
	});
});
