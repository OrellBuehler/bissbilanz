const TRANSIENT_PATTERNS = [
	'idle timeout',
	'connection terminated',
	'connection refused',
	'connection reset',
	'broken pipe',
	'unexpected eof'
];

/** Returns true for database errors caused by stale/dropped connections. */
export function isTransientDbError(error: unknown): boolean {
	const msg =
		error instanceof Error
			? (error.message + (error.cause instanceof Error ? ' ' + error.cause.message : '')).toLowerCase()
			: String(error).toLowerCase();
	return TRANSIENT_PATTERNS.some((p) => msg.includes(p));
}
