import type { RequestEvent } from '@sveltejs/kit';

/**
 * Number of reverse proxies in front of the app. Only the right-most
 * `TRUSTED_PROXY_COUNT` entries of `X-Forwarded-For` are written by
 * infrastructure we control; everything to the left is attacker-supplied.
 */
const TRUSTED_PROXY_COUNT = Math.max(1, Number(process.env.TRUSTED_PROXY_COUNT ?? '1') || 1);

/**
 * Real client IP for rate-limit bucketing.
 *
 * `getClientAddress()` returns the *socket* peer, which behind our Caddy reverse
 * proxy (`reverse_proxy bissbilanz:3000`) is Caddy's container IP — identical for
 * every request. Keying rate limits on it collapses every caller into one global
 * bucket, so a handful of requests can lock out login for the whole instance.
 *
 * We read `X-Forwarded-For` instead, taking the entry `TRUSTED_PROXY_COUNT` from
 * the right: the left-hand entries are client-supplied and trivially spoofed, so
 * counting from the right is the only spoof-resistant read. Falls back to the
 * socket address when the header is absent (direct container access, health
 * checks, tests) rather than throwing, so a missing header can never 500 a route.
 */
export function getRequestIp(event: RequestEvent): string {
	const forwarded = event.request.headers.get('x-forwarded-for');
	if (forwarded) {
		const addresses = forwarded
			.split(',')
			.map((value) => value.trim())
			.filter(Boolean);
		const candidate = addresses[addresses.length - TRUSTED_PROXY_COUNT];
		if (candidate) return candidate;
		// Fewer entries than trusted proxies: the chain is shorter than configured,
		// so the left-most entry is the closest thing to a trustworthy origin.
		if (addresses.length > 0) return addresses[0];
	}
	return event.getClientAddress();
}
