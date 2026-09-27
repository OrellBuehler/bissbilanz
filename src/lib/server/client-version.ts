import * as Sentry from '@sentry/sveltekit';
import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { getDB } from '$lib/server/db';
import { clientVersions } from '$lib/server/schema';
import {
	CLIENT_MIN_VERSION_HEADER,
	CLIENT_PLATFORM_HEADER,
	CLIENT_VERSION_HEADER,
	UPDATE_REQUIRED_CODE,
	UPDATE_REQUIRED_STATUS,
	compareVersions,
	isClientPlatform,
	parseVersion,
	type ClientPlatform
} from '$lib/client-version';

/**
 * Lowest app version the API still serves, per platform. Raise one only after
 * that platform's store release with the replacement has been out long enough
 * (docs/api-stability.md); older builds then get 426 and an update prompt.
 * Requests without version headers (old builds, MCP, scripts) are never blocked.
 */
export const MIN_CLIENT_VERSIONS: Partial<Record<ClientPlatform, string>> = {};

export type ClientInfo = { platform: ClientPlatform; version: string };

export function readClientInfo(request: Request): ClientInfo | null {
	const platform = request.headers.get(CLIENT_PLATFORM_HEADER)?.trim().toLowerCase();
	const version = request.headers.get(CLIENT_VERSION_HEADER)?.trim();
	if (!platform || !version || !isClientPlatform(platform)) return null;
	if (!parseVersion(version) || version.length > 64) return null;
	return { platform, version };
}

/** The minimum version this client falls short of, or null when it may proceed. */
export function requiredMinimum(
	client: ClientInfo,
	minimums: Partial<Record<ClientPlatform, string>> = MIN_CLIENT_VERSIONS
): string | null {
	const minimum = minimums[client.platform];
	if (!minimum) return null;
	const min = parseVersion(minimum);
	const current = parseVersion(client.version);
	if (!min || !current) return null;
	return compareVersions(current, min) < 0 ? minimum : null;
}

export function updateRequiredResponse(platform: ClientPlatform, minVersion: string): Response {
	return json(
		{ error: 'Update required', code: UPDATE_REQUIRED_CODE, platform, minVersion },
		{ status: UPDATE_REQUIRED_STATUS, headers: { [CLIENT_MIN_VERSION_HEADER]: minVersion } }
	);
}

const RECORD_INTERVAL_MS = 10 * 60 * 1000;
const lastRecorded = new Map<string, number>();

/** Upserts last-seen for this platform + version, at most once per interval per process. */
export function recordClientVersion(client: ClientInfo, now = Date.now()): void {
	const key = `${client.platform}/${client.version}`;
	const previous = lastRecorded.get(key);
	if (previous !== undefined && now - previous < RECORD_INTERVAL_MS) return;
	lastRecorded.set(key, now);
	getDB()
		.insert(clientVersions)
		.values({ platform: client.platform, version: client.version })
		.onConflictDoUpdate({
			target: [clientVersions.platform, clientVersions.version],
			set: { lastSeenAt: sql`now()` }
		})
		.catch((err) => {
			lastRecorded.delete(key);
			Sentry.captureException(err, { extra: { context: 'recordClientVersion', key } });
		});
}
