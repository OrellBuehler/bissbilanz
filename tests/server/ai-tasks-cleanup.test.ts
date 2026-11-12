import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createMockDB } from '../helpers/mock-db';

const { db, setResult, reset, getCalls } = createMockDB();
const unlinkUploads = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/db', () => ({ getDB: () => db }));
vi.mock('$lib/server/images', () => ({ unlinkUploads }));

const { cleanupAiTasks } = await import('$lib/server/ai-tasks');

beforeEach(() => {
	reset();
	unlinkUploads.mockReset().mockResolvedValue(undefined);
});

describe('cleanupAiTasks', () => {
	test('deletes old resolved tasks and their photos, sparing recent conversations', async () => {
		setResult([
			{ photoUrls: ['/uploads/a.webp'], userId: 'u1' },
			{ photoUrls: null, userId: 'u2' }
		]);
		await cleanupAiTasks();
		const tables = getCalls()
			.filter((call) => call.method === 'delete' || call.method === 'from')
			.map((call) => (call.args[0] as Record<symbol, string>)[Symbol.for('drizzle:Name')]);
		expect(tables).toEqual(['ai_tasks', 'claude_task_messages']);
		expect(unlinkUploads.mock.calls).toEqual([
			[['/uploads/a.webp'], 'u1'],
			[[], 'u2']
		]);
	});
});
