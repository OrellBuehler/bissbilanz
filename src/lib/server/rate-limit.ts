const buckets = new Map<string, { count: number; resetAt: number }>();
let callsSinceCleanup = 0;

function cleanupStale() {
	const now = Date.now();
	for (const [key, bucket] of buckets) {
		if (bucket.resetAt < now) buckets.delete(key);
	}
}

export const rateLimit = (key: string, max: number, windowMs: number) => {
	// Periodic cleanup every 100 calls
	if (++callsSinceCleanup >= 100) {
		callsSinceCleanup = 0;
		cleanupStale();
	}

	const now = Date.now();
	const bucket = buckets.get(key);
	if (!bucket || bucket.resetAt < now) {
		buckets.set(key, { count: 1, resetAt: now + windowMs });
		return;
	}
	if (bucket.count >= max) throw new Error('Rate limit exceeded');
	bucket.count += 1;
};
