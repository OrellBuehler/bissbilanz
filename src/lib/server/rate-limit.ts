import { RateLimitError } from './errors';

const buckets = new Map<string, { count: number; resetAt: number }>();
let callsSinceCleanup = 0;

function cleanupStale() {
	const now = Date.now();
	for (const [key, bucket] of buckets) {
		if (bucket.resetAt < now) buckets.delete(key);
	}
}

export const rateLimitApi = (userId: string, max = 120, windowMs = 60_000) => {
	rateLimit(`api:${userId}`, max, windowMs);
};

export const rateLimitUpload = (userId: string, max = 30, windowMs = 60_000) => {
	rateLimit(`upload:${userId}`, max, windowMs);
};

/**
 * The bulk food create sends up to 200 foods and their photos per request, so a
 * phone draining a 100k-food import needs its own bucket: it must not eat the
 * 120 writes/min every other mutation shares, nor the 30/min image budget.
 */
export const rateLimitBulk = (userId: string, max = 30, windowMs = 60_000) => {
	rateLimit(`bulk:${userId}`, max, windowMs);
};

const isBulkFoodsPath = (pathname: string) =>
	pathname === '/api/foods/bulk' || pathname === '/api/foods/bulk/';

/** Picks the bucket an authenticated API write counts against. */
export const rateLimitWrite = (userId: string, pathname: string) => {
	if (isBulkFoodsPath(pathname)) rateLimitBulk(userId);
	else if (pathname.startsWith('/api/images/upload') || pathname.startsWith('/api/ai-tasks/photo'))
		rateLimitUpload(userId);
	else rateLimitApi(userId);
};

export const rateLimitMcp = (userId: string, max = 300, windowMs = 60_000) => {
	rateLimit(`mcp:${userId}`, max, windowMs);
};

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
	if (bucket.count >= max) {
		throw new RateLimitError(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)));
	}
	bucket.count += 1;
};
