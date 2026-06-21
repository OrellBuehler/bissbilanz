/**
 * Shared HTTP contract for offline-queue sync, used by the web PWA, the Android
 * (KMP) app, and the iOS app. Mutations carry two optional request headers:
 *
 *  - `Idempotency-Key`: a stable UUID per logical mutation, constant across all
 *    retries of the same queued item. Lets the server dedupe replays (e.g. when a
 *    success ack is lost on a flaky connection) instead of applying the write twice.
 *  - `X-Client-Edited-At`: ISO-8601 instant at which the user actually made the
 *    edit. Used as the last-write-wins logical clock for conflict resolution, so
 *    sync *arrival* order doesn't decide the winner — edit time does.
 *
 * And one response header:
 *
 *  - `X-Sync-Conflict: server-newer`: the incoming edit lost to a newer change on
 *    the server. The client adopts server state and surfaces the loss to the user.
 */

export {
	IDEMPOTENCY_KEY_HEADER,
	CLIENT_EDITED_AT_HEADER,
	SYNC_CONFLICT_HEADER,
	SYNC_CONFLICT_SERVER_NEWER
} from '$lib/sync/contract';
import { IDEMPOTENCY_KEY_HEADER, CLIENT_EDITED_AT_HEADER } from '$lib/sync/contract';

/** Reject absurd keys early; a UUID is 36 chars, leave generous headroom. */
const MAX_IDEMPOTENCY_KEY_LENGTH = 200;

/**
 * Reads and sanity-checks the idempotency key from a request. Returns null when
 * absent or malformed (treated as "no idempotency" — the write still runs once).
 */
export function readIdempotencyKey(request: Request): string | null {
	const raw = request.headers.get(IDEMPOTENCY_KEY_HEADER);
	if (!raw) return null;
	const key = raw.trim();
	if (key.length === 0 || key.length > MAX_IDEMPOTENCY_KEY_LENGTH) return null;
	return key;
}

/**
 * Reads the client edit timestamp used for last-write-wins. Returns null when the
 * header is absent (older clients / non-offline writes) or unparseable, in which
 * case the server falls back to its previous "server clock" behaviour.
 */
export function readClientEditedAt(request: Request): Date | null {
	const raw = request.headers.get(CLIENT_EDITED_AT_HEADER);
	if (!raw) return null;
	const ms = Date.parse(raw);
	if (Number.isNaN(ms)) return null;
	return new Date(ms);
}
