/**
 * Shared offline-sync HTTP contract — header names used by BOTH the client
 * (browser sync queue) and the server hook/handlers. Kept outside `$lib/server`
 * so the client can import it without tripping SvelteKit's server-only guard.
 *
 * See `$lib/server/sync/headers.ts` for the server-side parsers and
 * `$lib/stores/sync.ts` for where the client stamps and reads these.
 */

/** Request header: stable per-mutation key for server-side dedup of replays. */
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

/** Request header: ISO-8601 instant of the user's edit, the LWW logical clock. */
export const CLIENT_EDITED_AT_HEADER = 'x-client-edited-at';

/** Response header: set when an edit lost last-write-wins. */
export const SYNC_CONFLICT_HEADER = 'x-sync-conflict';

/** Value of {@link SYNC_CONFLICT_HEADER} when the server had a newer value. */
export const SYNC_CONFLICT_SERVER_NEWER = 'server-newer';
