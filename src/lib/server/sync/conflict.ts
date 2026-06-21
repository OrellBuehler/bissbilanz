import { json } from '@sveltejs/kit';
import { lte, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { notFound } from '$lib/server/errors';
import { SYNC_CONFLICT_HEADER, SYNC_CONFLICT_SERVER_NEWER } from './headers';

/**
 * Last-write-wins conflict resolution for offline edits.
 *
 * Update domain functions apply the edit only when the caller's edit time is at
 * least as recent as the row's stored `updatedAt` (the logical clock of the last
 * winning write). When that guard fails — or the row was deleted on another
 * device — the update affects zero rows and returns `undefined`.
 *
 * This helper turns that `undefined` into the right response *given that a client
 * edit timestamp was supplied*: a stale offline edit becomes a 409 carrying the
 * {@link SYNC_CONFLICT_HEADER}, which the client reads as "your edit lost; adopt
 * server state and surface it" rather than dead-lettering it as a hard failure.
 * Legacy callers that send no edit timestamp keep the old 404 semantics.
 */

/**
 * Clamp the LWW logical clock to "now" so a device with a fast wall clock can't
 * stamp a far-future `updatedAt` and win every subsequent conflict forever.
 * Returns the server clock when no client edit time was supplied.
 */
export function lwwStamp(clientEditedAt: Date | null | undefined): Date {
	if (!clientEditedAt) return new Date();
	const now = Date.now();
	return clientEditedAt.getTime() > now ? new Date(now) : clientEditedAt;
}

/**
 * SQL guard for last-write-wins updates: only touch the row when the caller's
 * edit is at least as recent as the stored version. Returns `undefined` (a no-op
 * inside Drizzle's `and(...)`) when the client sent no edit time, preserving the
 * unconditional update path for online writes from older clients.
 */
export function lwwGuard(
	updatedAtColumn: PgColumn,
	clientEditedAt: Date | null | undefined
): SQL | undefined {
	return clientEditedAt ? lte(updatedAtColumn, clientEditedAt) : undefined;
}

/** 409 response telling the client its offline edit lost last-write-wins. */
export function staleConflict(): Response {
	return json(
		{ error: 'conflict_server_newer' },
		{ status: 409, headers: { [SYNC_CONFLICT_HEADER]: SYNC_CONFLICT_SERVER_NEWER } }
	);
}

type RespondUpdateOpts<T> = {
	/** Response envelope key, e.g. `'entry'` → `{ entry: ... }`. */
	key: string;
	/** Row returned by the LWW-guarded update; `undefined` when no row matched. */
	updated: T | null | undefined;
	/** The client edit time, if any, that was applied with LWW semantics. */
	clientEditedAt: Date | null;
	/** Resource label for the 404 message when there was no edit timestamp. */
	resourceName: string;
	/** Optional success status (defaults to 200). */
	status?: number;
};

/**
 * Builds the response for an LWW-guarded update/upsert:
 *  - row updated            → 200 `{ [key]: row }`
 *  - no row + edit time      → 409 conflict (server newer / deleted elsewhere)
 *  - no row + no edit time   → 404 (unchanged legacy behaviour)
 */
export function respondUpdate<T>(opts: RespondUpdateOpts<T>): Response {
	if (opts.updated) {
		return json({ [opts.key]: opts.updated }, { status: opts.status ?? 200 });
	}
	if (opts.clientEditedAt) {
		return staleConflict();
	}
	return notFound(opts.resourceName);
}
