import { parseVersion } from './client-version.ts';

/** Sentry release for a deployed web build, e.g. `bissbilanz-web@1.61.0`; none for dev and PR builds. */
export function sentryRelease(version: unknown): string | undefined {
	if (typeof version !== 'string' || !parseVersion(version)) return undefined;
	return `bissbilanz-web@${version.trim().replace(/^v/, '')}`;
}
