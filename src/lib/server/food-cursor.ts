export type FoodCursor = { timestamp: string; id: string };

const CURSOR_PATTERN =
	/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z)\|([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/**
 * Opaque cursor over (server_modified_at, id). The timestamp keeps Postgres'
 * microsecond precision: a millisecond Date would round-trip lossy and make a
 * page boundary repeat or skip rows written within the same millisecond.
 */
export const encodeFoodCursor = ({ timestamp, id }: FoodCursor): string =>
	Buffer.from(`${timestamp}|${id}`, 'utf8').toString('base64url');

export const decodeFoodCursor = (cursor: string): FoodCursor | null => {
	const match = CURSOR_PATTERN.exec(Buffer.from(cursor, 'base64url').toString('utf8'));
	if (!match) return null;
	const [, timestamp, id] = match;
	if (Number.isNaN(Date.parse(timestamp))) return null;
	return { timestamp, id: id.toLowerCase() };
};
