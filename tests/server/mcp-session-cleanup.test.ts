import { describe, it, expect, vi } from 'vitest';
import {
	enforceUserSessionCap,
	sweepExpiredSessions,
	type SessionEntry
} from '../../src/lib/server/mcp/sweep';

describe('enforceUserSessionCap', () => {
	const entry = (
		userId: string,
		lastActivity: number,
		close: () => void = vi.fn()
	): SessionEntry => ({
		transport: { close },
		userId,
		lastActivity
	});

	it('evicts the least recently used sessions of that user to make room for one more', () => {
		const sessions = new Map<string, SessionEntry>();
		const oldest = vi.fn();
		sessions.set('a', entry('u1', 100, oldest));
		sessions.set('b', entry('u1', 300));
		sessions.set('c', entry('u1', 200));
		sessions.set('other', entry('u2', 50));

		enforceUserSessionCap(sessions, 'u1', 3);

		expect([...sessions.keys()]).toEqual(['b', 'c', 'other']);
		expect(oldest).toHaveBeenCalledOnce();
	});

	it('leaves sessions alone while the user is under the cap', () => {
		const sessions = new Map<string, SessionEntry>();
		sessions.set('a', entry('u1', 100));
		sessions.set('b', entry('u1', 200));

		enforceUserSessionCap(sessions, 'u1', 3);

		expect(sessions.size).toBe(2);
	});

	it('survives transport.close() errors', () => {
		const sessions = new Map<string, SessionEntry>();
		sessions.set(
			'a',
			entry('u1', 100, () => {
				throw new Error('close failed');
			})
		);

		expect(() => enforceUserSessionCap(sessions, 'u1', 1)).not.toThrow();
		expect(sessions.size).toBe(0);
	});
});

describe('MCP session cleanup', () => {
	it('removes sessions older than TTL', () => {
		const sessions = new Map<string, SessionEntry>();
		const close = vi.fn();
		sessions.set('expired', {
			transport: { close },
			userId: 'user1',
			lastActivity: Date.now() - 2 * 60 * 60 * 1000 // 2 hours ago
		});
		sessions.set('active', {
			transport: { close: vi.fn() },
			userId: 'user2',
			lastActivity: Date.now()
		});

		sweepExpiredSessions(sessions, 60 * 60 * 1000);

		expect(sessions.size).toBe(1);
		expect(sessions.has('active')).toBe(true);
		expect(sessions.has('expired')).toBe(false);
		expect(close).toHaveBeenCalledOnce();
	});

	it('handles transport.close() errors gracefully', () => {
		const sessions = new Map<string, SessionEntry>();
		sessions.set('broken', {
			transport: {
				close: () => {
					throw new Error('close failed');
				}
			},
			userId: 'user1',
			lastActivity: Date.now() - 2 * 60 * 60 * 1000
		});

		expect(() => sweepExpiredSessions(sessions, 60 * 60 * 1000)).not.toThrow();
		expect(sessions.size).toBe(0);
	});

	it('keeps all sessions when none are expired', () => {
		const sessions = new Map<string, SessionEntry>();
		sessions.set('a', {
			transport: { close: vi.fn() },
			userId: 'user1',
			lastActivity: Date.now()
		});
		sessions.set('b', {
			transport: { close: vi.fn() },
			userId: 'user2',
			lastActivity: Date.now() - 30 * 60 * 1000 // 30 min ago
		});

		sweepExpiredSessions(sessions, 60 * 60 * 1000);

		expect(sessions.size).toBe(2);
	});
});
