const buckets = new Map<string, { count: number; resetAt: number }>();

export const rateLimit = (key: string, max: number, windowMs: number) => {
	const now = Date.now();
	const bucket = buckets.get(key);
	if (!bucket || bucket.resetAt < now) {
		buckets.set(key, { count: 1, resetAt: now + windowMs });
		return;
	}
	if (bucket.count >= max) throw new Error('Rate limit exceeded');
	bucket.count += 1;
};
