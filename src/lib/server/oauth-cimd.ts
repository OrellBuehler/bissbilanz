import { lookup } from 'node:dns/promises';
import { isIPv4 } from 'node:net';
import * as Sentry from '@sentry/sveltekit';
import { getDB, oauthClients, type OAuthClient } from './db';
import { getOAuthClient, isValidRedirectUriFormat } from './oauth';

export const CIMD_FETCH_TIMEOUT_MS = 10_000;
export const CIMD_MAX_BYTES = 64 * 1024;
export const CIMD_CACHE_TTL_MS = 60 * 60 * 1000;
const CIMD_CACHE_MAX_ENTRIES = 256;
const MAX_REDIRECT_URIS = 20;

export type ClientIdMetadata = {
	clientId: string;
	clientName: string | null;
	clientUri: string | null;
	redirectUris: string[];
};

type CacheEntry = { metadata: ClientIdMetadata; expiresAt: number };
const cache = new Map<string, CacheEntry>();

export function clearClientIdMetadataCache(): void {
	cache.clear();
}

/**
 * A Client ID Metadata Document identifier is an https URL with a host name
 * (never an IP literal or localhost), a non-root path, no credentials, no
 * fragment and no dot segments. Anything else is treated as an ordinary
 * pre-registered client id.
 */
export function isClientIdMetadataUrl(clientId: string): boolean {
	if (!clientId.startsWith('https://') || !URL.canParse(clientId)) return false;
	const url = new URL(clientId);
	if (url.protocol !== 'https:') return false;
	if (url.username || url.password || url.hash) return false;
	if (url.href !== clientId) return false;
	if (url.pathname === '/' || url.pathname === '') return false;
	if (url.pathname.split('/').some((segment) => segment === '.' || segment === '..')) return false;
	return isPublicHostname(url.hostname);
}

function isPublicHostname(hostname: string): boolean {
	const host = hostname.toLowerCase();
	if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return false;
	if (host.startsWith('[')) return false;
	if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
	return host.includes('.');
}

function optionalString(value: unknown, max: number): string | null {
	return typeof value === 'string' && value.length > 0 ? value.slice(0, max) : null;
}

function includesOrAbsent(value: unknown, required: string): boolean {
	if (value === undefined) return true;
	return Array.isArray(value) && value.includes(required);
}

export function parseClientIdMetadata(
	clientId: string,
	body: unknown
): ClientIdMetadata | undefined {
	if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;
	const doc = body as Record<string, unknown>;

	if (doc.client_id !== clientId) return undefined;

	const redirectUris = doc.redirect_uris;
	if (!Array.isArray(redirectUris) || redirectUris.length === 0) return undefined;
	if (redirectUris.length > MAX_REDIRECT_URIS) return undefined;
	if (!redirectUris.every((uri) => typeof uri === 'string' && isValidRedirectUriFormat(uri))) {
		return undefined;
	}

	if (doc.token_endpoint_auth_method !== undefined && doc.token_endpoint_auth_method !== 'none') {
		return undefined;
	}
	if (!includesOrAbsent(doc.grant_types, 'authorization_code')) return undefined;
	if (!includesOrAbsent(doc.response_types, 'code')) return undefined;

	return {
		clientId,
		clientName: optionalString(doc.client_name, 256),
		clientUri: optionalString(doc.client_uri, 2048),
		redirectUris: (redirectUris as string[]).map((uri) => uri.replace(/\/$/, ''))
	};
}

function isPublicIpv4(ip: string): boolean {
	const [a, b] = ip.split('.').map(Number);
	if (a === 0 || a === 10 || a === 127) return false;
	if (a === 100 && b >= 64 && b <= 127) return false;
	if (a === 169 && b === 254) return false;
	if (a === 172 && b >= 16 && b <= 31) return false;
	if (a === 192 && b === 168) return false;
	if (a >= 224) return false;
	return true;
}

function isPublicIpv6(ip: string): boolean {
	const lower = ip.toLowerCase();
	if (lower === '::' || lower === '::1') return false;
	if (lower.startsWith('::ffff:')) return isPublicIpv4(lower.slice(7));
	if (/^f[cd]/.test(lower) || /^fe[89ab]/.test(lower)) return false;
	return true;
}

export function isPublicIp(ip: string): boolean {
	return isIPv4(ip) ? isPublicIpv4(ip) : isPublicIpv6(ip);
}

/** Refuses hosts that resolve into private or loopback space so the metadata fetch cannot probe the server's own network. */
async function resolvesToPublicAddress(hostname: string): Promise<boolean> {
	const addresses = await lookup(hostname, { all: true, verbatim: true });
	return addresses.length > 0 && addresses.every(({ address }) => isPublicIp(address));
}

async function fetchClientIdMetadata(clientId: string): Promise<ClientIdMetadata | undefined> {
	if (!(await resolvesToPublicAddress(new URL(clientId).hostname))) return undefined;

	const response = await fetch(clientId, {
		headers: { Accept: 'application/json' },
		redirect: 'manual',
		signal: AbortSignal.timeout(CIMD_FETCH_TIMEOUT_MS)
	});
	if (!response.ok) return undefined;

	const length = Number(response.headers.get('content-length'));
	if (Number.isFinite(length) && length > CIMD_MAX_BYTES) return undefined;

	const text = await response.text();
	if (text.length > CIMD_MAX_BYTES) return undefined;

	let body: unknown;
	try {
		body = JSON.parse(text);
	} catch (err) {
		Sentry.captureException(err, { level: 'warning', tags: { cimd: clientId } });
		return undefined;
	}
	return parseClientIdMetadata(clientId, body);
}

export async function resolveClientIdMetadata(
	clientId: string
): Promise<ClientIdMetadata | undefined> {
	if (!isClientIdMetadataUrl(clientId)) return undefined;

	const cached = cache.get(clientId);
	if (cached && cached.expiresAt > Date.now()) return cached.metadata;

	let metadata: ClientIdMetadata | undefined;
	try {
		metadata = await fetchClientIdMetadata(clientId);
	} catch (err) {
		Sentry.captureException(err, { level: 'warning', tags: { cimd: clientId } });
		return undefined;
	}
	if (!metadata) return undefined;

	if (cache.size >= CIMD_CACHE_MAX_ENTRIES) {
		const oldest = cache.keys().next().value;
		if (oldest !== undefined) cache.delete(oldest);
	}
	cache.set(clientId, { metadata, expiresAt: Date.now() + CIMD_CACHE_TTL_MS });
	return metadata;
}

/**
 * Materialises a CIMD client as a public `oauth_clients` row so the
 * authorization, code and token tables can reference it like any other
 * client. Re-run on every authorization request so redirect URIs and the
 * display name follow the document.
 */
export async function upsertClientIdMetadataClient(
	metadata: ClientIdMetadata
): Promise<OAuthClient> {
	const db = getDB();
	const [client] = await db
		.insert(oauthClients)
		.values({
			userId: null,
			clientId: metadata.clientId,
			clientSecretHash: null,
			clientName: metadata.clientName,
			allowedRedirectUris: metadata.redirectUris,
			tokenEndpointAuthMethod: 'none'
		})
		.onConflictDoUpdate({
			target: oauthClients.clientId,
			set: {
				clientName: metadata.clientName,
				allowedRedirectUris: metadata.redirectUris,
				tokenEndpointAuthMethod: 'none',
				clientSecretHash: null
			}
		})
		.returning();
	return client;
}

/**
 * Looks a client up for an authorization request: a CIMD URL is fetched and
 * materialised, anything else must be a pre-registered client.
 */
export async function resolveOAuthClient(clientId: string): Promise<OAuthClient | undefined> {
	if (isClientIdMetadataUrl(clientId)) {
		const metadata = await resolveClientIdMetadata(clientId);
		if (!metadata) return undefined;
		return upsertClientIdMetadataClient(metadata);
	}
	return getOAuthClient(clientId);
}
