import { json, type RequestEvent } from '@sveltejs/kit';
import { and, eq, lt, isNull } from 'drizzle-orm';
import * as Sentry from '@sentry/sveltekit';
import { getDB } from '$lib/server/db';
import { idempotencyKeys } from '$lib/server/schema';
import { SYNC_CONFLICT_HEADER } from '$lib/server/sync/headers';

/** Header echoed on a replayed response so clients/tests can observe dedup. */
const REPLAY_HEADER = 'x-idempotent-replay';

/** Stored idempotency records older than this are pruned. */
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * How long a claim may stay in flight before a retry is allowed to take it over.
 *
 * A claim row is written before the handler runs and cleared on 5xx/throw, but a
 * process death (deploy, restart, OOM) between those two points strands it with a
 * NULL status forever. Without this window every retry would answer 409
 * `request_in_progress` until the 7-day prune, and the client — which cannot
 * distinguish that from a permanent client error — would dead-letter the user's
 * write. Longer than any real request, short enough that a retry recovers fast.
 */
const CLAIM_STALE_MS = 60_000;

type ResolveFn = (event: RequestEvent) => Response | Promise<Response>;

/**
 * Reconstructs a stored response. Bodies are always JSON or empty in our API, so
 * we only need to special-case the empty/no-content case (a 204 must have no body).
 */
function replayResponse(statusCode: number, body: string | null): Response {
	const hasBody = body !== null && body.length > 0;
	const headers = new Headers({ [REPLAY_HEADER]: 'true' });
	if (hasBody) headers.set('content-type', 'application/json');
	return new Response(hasBody ? body : null, { status: statusCode, headers });
}

/**
 * Wraps a mutating request in idempotency handling. The caller guarantees `key`
 * is present and the user is authed. Behaviour:
 *
 *  - First time we see (user, key): claim it, run the handler, and persist the
 *    final response when it is safe to replay (status < 500). Transient failures
 *    (5xx / thrown) release the claim so a later retry runs for real.
 *  - Replay of the same (method, path): a completed record exists → return the
 *    original response verbatim.
 *  - Same key, different (method, path): 422 — the key was reused for a different
 *    logical mutation, and replaying another endpoint's body would be a lie.
 *  - In flight: a fresh claim exists → 409 so the client backs off and retries.
 *    A claim older than {@link CLAIM_STALE_MS} is treated as abandoned and taken
 *    over instead, so a crashed request can never strand the write.
 */
export async function withIdempotency(
	event: RequestEvent,
	resolve: ResolveFn,
	userId: string,
	key: string
): Promise<Response> {
	const db = getDB();
	const method = event.request.method;
	const path = event.url.pathname;

	// Atomically claim the key. ON CONFLICT DO NOTHING means a concurrent or prior
	// request already owns it, and we get an empty array back.
	let claimed: { userId: string }[];
	try {
		claimed = await db
			.insert(idempotencyKeys)
			.values({ userId, key, method, path })
			.onConflictDoNothing({ target: [idempotencyKeys.userId, idempotencyKeys.key] })
			.returning({ userId: idempotencyKeys.userId });
	} catch (error) {
		// If the idempotency bookkeeping itself fails, don't take the write down with
		// it — fall back to running the handler once without dedup protection.
		Sentry.captureException(error);
		return resolve(event);
	}

	if (claimed.length === 0) {
		const [existing] = await db
			.select({
				statusCode: idempotencyKeys.statusCode,
				responseBody: idempotencyKeys.responseBody,
				method: idempotencyKeys.method,
				path: idempotencyKeys.path
			})
			.from(idempotencyKeys)
			.where(and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, key)))
			.limit(1);

		// A key identifies one logical mutation. Reusing it for a different target
		// would replay an unrelated response body as if it were this request's, so
		// refuse rather than answer with someone else's result (RFC 9110 §8.8.3).
		if (existing && (existing.method !== method || existing.path !== path)) {
			return json({ error: 'idempotency_key_reused' }, { status: 422 });
		}

		if (existing && existing.statusCode !== null) {
			return replayResponse(existing.statusCode, existing.responseBody);
		}

		// Claim exists but the original request hasn't finished. If it is older than
		// the staleness window its owner is gone (crash/restart), so reclaim it and
		// run for real; otherwise tell the client to back off and retry.
		const reclaimed = await db
			.update(idempotencyKeys)
			.set({ createdAt: new Date() })
			.where(
				and(
					eq(idempotencyKeys.userId, userId),
					eq(idempotencyKeys.key, key),
					isNull(idempotencyKeys.statusCode),
					lt(idempotencyKeys.createdAt, new Date(Date.now() - CLAIM_STALE_MS))
				)
			)
			.returning({ userId: idempotencyKeys.userId });

		if (reclaimed.length === 0) {
			return json({ error: 'request_in_progress' }, { status: 409 });
		}
	}

	const release = async () => {
		await db
			.delete(idempotencyKeys)
			.where(and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, key)))
			.catch((error) => Sentry.captureException(error));
	};

	let response: Response;
	try {
		response = await resolve(event);
	} catch (error) {
		await release();
		throw error;
	}

	// Don't cache responses we can't faithfully replay or that are transient:
	//  - 5xx are transient; let the retry run for real.
	//  - A last-write-wins conflict (X-Sync-Conflict) carries a header replay
	//    can't reconstruct, and it means the write was rejected (no mutation), so
	//    re-running deterministically re-derives the same conflict + header.
	if (response.status >= 500 || response.headers.has(SYNC_CONFLICT_HEADER)) {
		await release();
		return response;
	}

	const body = await response.clone().text();
	await db
		.update(idempotencyKeys)
		.set({ statusCode: response.status, responseBody: body })
		.where(and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, key)))
		.catch((error) => Sentry.captureException(error));

	return response;
}

/** Prunes idempotency records past the retention window. Best-effort. */
export async function cleanupIdempotencyKeys(): Promise<void> {
	const db = getDB();
	const cutoff = new Date(Date.now() - RETENTION_MS);
	await db.delete(idempotencyKeys).where(lt(idempotencyKeys.createdAt, cutoff));
}
