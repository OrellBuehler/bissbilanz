import { describe, expect, test } from 'vitest';
import { decodeFoodCursor, encodeFoodCursor } from '../../src/lib/server/food-cursor';

const ID = '10000000-0000-4000-8000-000000000010';
const TIMESTAMP = '2026-10-05T12:34:56.123456Z';

describe('food cursor', () => {
	test('round-trips the microsecond timestamp and the id', () => {
		const cursor = encodeFoodCursor({ timestamp: TIMESTAMP, id: ID });
		expect(decodeFoodCursor(cursor)).toEqual({ timestamp: TIMESTAMP, id: ID });
	});

	test('is url-safe base64 of "timestamp|id"', () => {
		const cursor = encodeFoodCursor({ timestamp: TIMESTAMP, id: ID });
		expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(Buffer.from(cursor, 'base64url').toString('utf8')).toBe(`${TIMESTAMP}|${ID}`);
	});

	test('lowercases the id', () => {
		const cursor = encodeFoodCursor({ timestamp: TIMESTAMP, id: ID.toUpperCase() });
		expect(decodeFoodCursor(cursor)?.id).toBe(ID);
	});

	test.each([
		['empty', ''],
		['garbage', '!!!'],
		['no separator', Buffer.from(TIMESTAMP).toString('base64url')],
		['millisecond timestamp', Buffer.from(`2026-10-05T12:34:56.123Z|${ID}`).toString('base64url')],
		['bad id', Buffer.from(`${TIMESTAMP}|not-a-uuid`).toString('base64url')],
		['impossible date', Buffer.from(`2026-13-45T25:61:61.123456Z|${ID}`).toString('base64url')],
		['injection', Buffer.from(`${TIMESTAMP}|${ID}'; DROP TABLE foods;--`).toString('base64url')]
	])('rejects %s', (_name, cursor) => {
		expect(decodeFoodCursor(cursor)).toBeNull();
	});
});
