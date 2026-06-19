export type CacheLike = {
	get: (key: string) => Promise<string | null>;
	set: (key: string, value: string) => Promise<void>;
};

export type PoliteClientOpts = {
	minDelayMs?: number;
	maxRetries?: number;
	userAgent?: string;
	sleep?: (ms: number) => Promise<void>;
	fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
	cache?: CacheLike;
	now?: () => number;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createPoliteClient(opts: PoliteClientOpts = {}) {
	const minDelayMs = opts.minDelayMs ?? 500;
	const maxRetries = opts.maxRetries ?? 4;
	const sleep = opts.sleep ?? defaultSleep;
	const doFetch = opts.fetchImpl ?? fetch;
	const now = opts.now ?? Date.now;
	const ua = opts.userAgent ?? 'Bissbilanz-Catalog-Crawler/1.0 (+private use; non-redistribution)';
	let lastAt = 0;

	async function throttle() {
		const wait = Math.max(0, lastAt + minDelayMs - now());
		if (wait > 0) await sleep(wait);
		lastAt = now();
	}

	async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T | null> {
		const cacheKey = Object.keys(headers).length > 0 ? `${url}|${JSON.stringify(headers)}` : url;
		if (opts.cache) {
			const hit = await opts.cache.get(cacheKey);
			if (hit != null) return JSON.parse(hit) as T;
		}
		let attempt = 0;
		for (;;) {
			await throttle();
			try {
				const res = await doFetch(url, { headers: { 'User-Agent': ua, ...headers } });
				if (res.status === 404 || res.status === 410) return null;
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const text = await res.text();
				if (opts.cache) await opts.cache.set(cacheKey, text);
				return JSON.parse(text) as T;
			} catch (err) {
				attempt++;
				if (attempt >= maxRetries) throw err;
				await sleep(minDelayMs * 2 ** attempt);
			}
		}
	}

	return { getJson };
}
