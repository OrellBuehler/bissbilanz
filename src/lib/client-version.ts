/**
 * Client version contract shared by the server hook and the web client. Every
 * first-party client (web, Android, Wear OS, iOS, watchOS) sends its platform
 * and marketing version; the server answers 426 when the version is below the
 * platform's minimum in `$lib/server/client-version.ts`.
 */

export const CLIENT_PLATFORM_HEADER = 'x-client-platform';
export const CLIENT_VERSION_HEADER = 'x-client-version';

/** Response header on a 426: the lowest version the server still accepts. */
export const CLIENT_MIN_VERSION_HEADER = 'x-client-min-version';

export const UPDATE_REQUIRED_STATUS = 426;
export const UPDATE_REQUIRED_CODE = 'client_update_required';

export const CLIENT_PLATFORMS = ['web', 'android', 'wearos', 'ios', 'watchos'] as const;
export type ClientPlatform = (typeof CLIENT_PLATFORMS)[number];

export function isClientPlatform(value: string): value is ClientPlatform {
	return (CLIENT_PLATFORMS as readonly string[]).includes(value);
}

/** Parses `1.52.0`, `v1.52.0` or `1.52.0-rc.1` into its numeric core; null otherwise. */
export function parseVersion(value: string): [number, number, number] | null {
	const match = /^v?(\d{1,6})\.(\d{1,6})\.(\d{1,6})(?:[-+].*)?$/.exec(value.trim());
	if (!match) return null;
	return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareVersions(a: [number, number, number], b: [number, number, number]): number {
	for (let i = 0; i < 3; i++) {
		if (a[i] !== b[i]) return a[i] - b[i];
	}
	return 0;
}
