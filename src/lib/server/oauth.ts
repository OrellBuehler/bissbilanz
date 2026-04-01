import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import { compareSync, hashSync } from 'bcrypt';
import { eq, and, gt, lt, isNull } from 'drizzle-orm';
import {
	getDB,
	oauthClients,
	oauthTokens,
	oauthAuthorizations,
	oauthAuthorizationCodes,
	type OAuthClient,
	type NewOAuthClient,
	type OAuthAuthorization,
	type NewOAuthAuthorization,
	type NewOAuthAuthorizationCode
} from './db';

// Constants
export const SALT_ROUNDS = 10;

export type ClientIdMetadata = {
	client_id: string;
	client_name?: string;
	client_uri?: string;
	redirect_uris: string[];
	grant_types?: string[];
	response_types?: string[];
	token_endpoint_auth_method?: string;
};
export const ACCESS_TOKEN_LIFETIME_MS = 60 * 60 * 1000; // 1 hour
export const REFRESH_TOKEN_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const AUTH_CODE_LIFETIME_MS = 10 * 60 * 1000; // 10 minutes

export function generateToken(bytes: number = 32): string {
	return randomBytes(bytes).toString('base64url');
}

export function generateClientId(): string {
	return generateToken(24);
}

export function generateClientSecret(): string {
	return generateToken(32);
}

export function hashToken(token: string): string {
	return hashSync(token, SALT_ROUNDS);
}

export function verifyToken(token: string, hash: string): boolean {
	return compareSync(token, hash);
}

export function verifyPKCE(codeVerifier: string, codeChallenge: string): boolean {
	const hash = createHash('sha256').update(codeVerifier).digest('base64url');
	if (hash.length !== codeChallenge.length) return false;
	return timingSafeEqual(Buffer.from(hash), Buffer.from(codeChallenge));
}

const ALLOWED_SCHEMES = new Set(['https:', 'http:']);
const CUSTOM_APP_SCHEME = /^[a-z][a-z0-9+.-]*:$/;
const BROWSER_SCHEMES = new Set([
	'javascript:',
	'vbscript:',
	'data:',
	'blob:',
	'file:',
	'about:',
	'chrome:',
	'chrome-extension:',
	'moz-extension:',
	'ms-browser-extension:',
	'view-source:'
]);

export function isValidRedirectUriFormat(uri: string): boolean {
	try {
		const url = new URL(uri);
		if (url.protocol === 'https:') return true;
		if (url.protocol === 'http:') {
			return (
				url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
			);
		}
		return CUSTOM_APP_SCHEME.test(url.protocol) && !BROWSER_SCHEMES.has(url.protocol);
	} catch {
		return false;
	}
}

const CODE_VERIFIER_REGEX = /^[A-Za-z0-9\-._~]{43,128}$/;
const CODE_CHALLENGE_S256_REGEX = /^[A-Za-z0-9\-_]{43}$/;

export function isValidCodeVerifier(codeVerifier: string): boolean {
	return CODE_VERIFIER_REGEX.test(codeVerifier);
}

export function isValidCodeChallengeS256(codeChallenge: string): boolean {
	return CODE_CHALLENGE_S256_REGEX.test(codeChallenge);
}

export async function getOrCreateOAuthClient(
	userId: string
): Promise<{ client: OAuthClient; secret?: string }> {
	const db = getDB();

	const existing = await db.query.oauthClients.findFirst({
		where: eq(oauthClients.userId, userId)
	});

	if (existing) {
		return { client: existing };
	}

	const clientId = generateClientId();
	const clientSecret = generateClientSecret();
	const clientSecretHash = hashToken(clientSecret);

	const newClient: NewOAuthClient = {
		userId,
		clientId,
		clientSecretHash
	};

	const [client] = await db.insert(oauthClients).values(newClient).returning();

	return {
		client,
		secret: clientSecret
	};
}

export async function getOAuthClient(clientId: string): Promise<OAuthClient | undefined> {
	const db = getDB();
	return db.query.oauthClients.findFirst({
		where: eq(oauthClients.clientId, clientId)
	});
}

export async function verifyOAuthClient(
	clientId: string,
	clientSecret: string
): Promise<OAuthClient | undefined> {
	const client = await getOAuthClient(clientId);

	if (!client || !client.clientSecretHash) {
		return undefined;
	}

	const isValid = verifyToken(clientSecret, client.clientSecretHash);
	return isValid ? client : undefined;
}

export async function getPublicOAuthClient(clientId: string): Promise<OAuthClient | undefined> {
	const client = await getOAuthClient(clientId);

	if (!client || client.tokenEndpointAuthMethod !== 'none') {
		return undefined;
	}

	return client;
}

export async function regenerateClientSecret(
	userId: string
): Promise<{ client: OAuthClient; secret: string }> {
	const db = getDB();

	const existing = await db.query.oauthClients.findFirst({
		where: eq(oauthClients.userId, userId)
	});

	if (!existing) {
		throw new Error('No OAuth client found for user');
	}

	const clientSecret = generateClientSecret();
	const clientSecretHash = hashToken(clientSecret);

	const [client] = await db
		.update(oauthClients)
		.set({ clientSecretHash })
		.where(eq(oauthClients.userId, userId))
		.returning();

	await db.delete(oauthTokens).where(eq(oauthTokens.clientId, existing.clientId));

	return {
		client,
		secret: clientSecret
	};
}

export async function addAllowedRedirectUri(
	clientId: string,
	redirectUri: string
): Promise<OAuthClient> {
	const db = getDB();

	const client = await getOAuthClient(clientId);
	if (!client) {
		throw new Error('OAuth client not found');
	}

	const normalizedUri = redirectUri.replace(/\/$/, '');

	if (client.allowedRedirectUris.includes(normalizedUri)) {
		return client;
	}

	const [updated] = await db
		.update(oauthClients)
		.set({
			allowedRedirectUris: [...client.allowedRedirectUris, normalizedUri]
		})
		.where(eq(oauthClients.clientId, clientId))
		.returning();

	return updated;
}

export function validateRedirectUri(client: OAuthClient, redirectUri: string): boolean {
	const normalizedUri = redirectUri.replace(/\/$/, '');
	return client.allowedRedirectUris.includes(normalizedUri);
}

export async function hasAuthorization(userId: string, clientId: string): Promise<boolean> {
	const db = getDB();
	const authorization = await db.query.oauthAuthorizations.findFirst({
		where: and(eq(oauthAuthorizations.userId, userId), eq(oauthAuthorizations.clientId, clientId))
	});
	return !!authorization;
}

export async function createAuthorization(
	userId: string,
	clientId: string
): Promise<OAuthAuthorization> {
	const db = getDB();

	const existing = await db.query.oauthAuthorizations.findFirst({
		where: and(eq(oauthAuthorizations.userId, userId), eq(oauthAuthorizations.clientId, clientId))
	});

	if (existing) {
		return existing;
	}

	const newAuth: NewOAuthAuthorization = {
		userId,
		clientId
	};

	const [authorization] = await db.insert(oauthAuthorizations).values(newAuth).returning();
	return authorization;
}

function hashAuthorizationCode(code: string): string {
	return createHash('sha256').update(code).digest('hex');
}

export async function createAuthorizationCode(
	userId: string,
	clientId: string,
	redirectUri: string,
	codeChallenge: string
): Promise<string> {
	const db = getDB();

	const code = generateToken(32);
	const codeHash = hashAuthorizationCode(code);
	const expiresAt = new Date(Date.now() + AUTH_CODE_LIFETIME_MS);

	const newCode: NewOAuthAuthorizationCode = {
		code: codeHash,
		clientId,
		userId,
		redirectUri,
		codeChallenge,
		codeChallengeMethod: 'S256',
		expiresAt
	};

	await db.insert(oauthAuthorizationCodes).values(newCode);

	return code;
}

export async function consumeAuthorizationCode(
	code: string,
	clientId: string,
	redirectUri: string,
	codeVerifier: string
): Promise<string | undefined> {
	const db = getDB();

	const codeHash = hashAuthorizationCode(code);

	const [authCode] = await db
		.update(oauthAuthorizationCodes)
		.set({ usedAt: new Date() })
		.where(
			and(
				eq(oauthAuthorizationCodes.code, codeHash),
				isNull(oauthAuthorizationCodes.usedAt),
				gt(oauthAuthorizationCodes.expiresAt, new Date()),
				eq(oauthAuthorizationCodes.clientId, clientId),
				eq(oauthAuthorizationCodes.redirectUri, redirectUri)
			)
		)
		.returning();

	if (!authCode) return undefined;

	const pkceValid = verifyPKCE(codeVerifier, authCode.codeChallenge);
	if (!pkceValid) return undefined;

	return authCode.userId;
}

function hashAccessToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export async function createAccessToken(
	userId: string,
	clientId: string,
	conn?: Parameters<Parameters<ReturnType<typeof getDB>['transaction']>[0]>[0]
): Promise<{ accessToken: string; refreshToken: string }> {
	const db = conn ?? getDB();

	const accessToken = generateToken(32);
	const refreshToken = generateToken(32);
	const accessTokenHash = hashAccessToken(accessToken);
	const refreshTokenHash = hashAccessToken(refreshToken);

	const expiresAt = new Date(Date.now() + ACCESS_TOKEN_LIFETIME_MS);
	const refreshTokenExpiresAt = new Date(Date.now() + REFRESH_TOKEN_LIFETIME_MS);

	await db.insert(oauthTokens).values({
		accessTokenHash,
		refreshTokenHash,
		clientId,
		userId,
		expiresAt,
		refreshTokenExpiresAt
	});

	return { accessToken, refreshToken };
}

export async function refreshAccessToken(
	refreshToken: string,
	clientId: string
): Promise<{ accessToken: string; refreshToken: string; userId: string } | undefined> {
	const db = getDB();
	const tokenHash = hashAccessToken(refreshToken);
	const now = new Date();

	return db.transaction(async (tx) => {
		const tokenRecord = await tx.query.oauthTokens.findFirst({
			where: and(
				eq(oauthTokens.refreshTokenHash, tokenHash),
				eq(oauthTokens.clientId, clientId),
				gt(oauthTokens.refreshTokenExpiresAt, now)
			)
		});

		if (!tokenRecord) return undefined;

		await tx.delete(oauthTokens).where(eq(oauthTokens.id, tokenRecord.id));

		const result = await createAccessToken(tokenRecord.userId, clientId, tx);
		return { ...result, userId: tokenRecord.userId };
	});
}

export async function validateAccessToken(
	token: string
): Promise<{ userId: string; clientId: string; scopes: string[] } | undefined> {
	const db = getDB();

	const tokenHash = hashAccessToken(token);
	const now = new Date();

	const tokenRecord = await db.query.oauthTokens.findFirst({
		where: and(eq(oauthTokens.accessTokenHash, tokenHash), gt(oauthTokens.expiresAt, now))
	});

	if (!tokenRecord) return undefined;

	return {
		userId: tokenRecord.userId,
		clientId: tokenRecord.clientId,
		scopes: tokenRecord.scopes
	};
}

export async function listAuthorizedClients(
	userId: string
): Promise<{ clientId: string; clientName: string | null; approvedAt: Date | null }[]> {
	const db = getDB();
	const results = await db
		.select({
			clientId: oauthAuthorizations.clientId,
			clientName: oauthClients.clientName,
			approvedAt: oauthAuthorizations.approvedAt
		})
		.from(oauthAuthorizations)
		.innerJoin(oauthClients, eq(oauthAuthorizations.clientId, oauthClients.clientId))
		.where(eq(oauthAuthorizations.userId, userId));
	return results;
}

export async function revokeAuthorization(userId: string, clientId: string): Promise<void> {
	const db = getDB();
	await db.transaction(async (tx) => {
		await tx
			.delete(oauthAuthorizations)
			.where(
				and(eq(oauthAuthorizations.userId, userId), eq(oauthAuthorizations.clientId, clientId))
			);
		await tx
			.delete(oauthTokens)
			.where(and(eq(oauthTokens.clientId, clientId), eq(oauthTokens.userId, userId)));
	});
}

export async function revokeClientTokens(clientId: string): Promise<void> {
	const db = getDB();
	await db.delete(oauthTokens).where(eq(oauthTokens.clientId, clientId));
}

export async function cleanupExpiredOAuthData(): Promise<void> {
	const db = getDB();
	const now = new Date();

	await db.delete(oauthTokens).where(lt(oauthTokens.expiresAt, now));
	await db.delete(oauthAuthorizationCodes).where(lt(oauthAuthorizationCodes.expiresAt, now));
}

export function isUrlClientId(clientId: string): boolean {
	try {
		const url = new URL(clientId);
		return url.protocol === 'https:' && url.pathname !== '/';
	} catch {
		return false;
	}
}

export function isPrivateIp(hostname: string): boolean {
	if (hostname === 'localhost' || hostname === '::1') return true;
	if (hostname.endsWith('.local')) return true;

	const parts = hostname.split('.').map(Number);
	if (parts.length === 4 && parts.every((p) => !isNaN(p))) {
		if (parts[0] === 127) return true;
		if (parts[0] === 10) return true;
		if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
		if (parts[0] === 192 && parts[1] === 168) return true;
	}

	if (hostname.startsWith('fc') || hostname.startsWith('fd')) return true;
	if (hostname.toLowerCase().startsWith('fe80')) return true;

	return false;
}

const CLIENT_METADATA_CACHE = new Map<string, { metadata: ClientIdMetadata; expiresAt: number }>();
const METADATA_CACHE_TTL_MS = 5 * 60 * 1000;

export async function fetchClientIdMetadata(clientIdUrl: string): Promise<ClientIdMetadata> {
	if (!isUrlClientId(clientIdUrl)) {
		throw new Error('client_id must be an HTTPS URL with a path component');
	}

	const now = Date.now();
	const cached = CLIENT_METADATA_CACHE.get(clientIdUrl);
	if (cached && cached.expiresAt > now) {
		return cached.metadata;
	}

	if (CLIENT_METADATA_CACHE.size > 50) {
		for (const [key, entry] of CLIENT_METADATA_CACHE) {
			if (entry.expiresAt <= now) {
				CLIENT_METADATA_CACHE.delete(key);
			}
		}
	}

	const url = new URL(clientIdUrl);
	if (isPrivateIp(url.hostname)) {
		throw new Error('client_id URL hostname resolves to a private IP address');
	}

	const response = await fetch(clientIdUrl, {
		signal: AbortSignal.timeout(5000),
		headers: { Accept: 'application/json' }
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch client metadata: ${response.status}`);
	}

	const contentType = response.headers.get('content-type') ?? '';
	if (!contentType.includes('application/json')) {
		throw new Error('Client metadata response is not JSON');
	}

	const data = (await response.json()) as unknown;
	if (typeof data !== 'object' || data === null) {
		throw new Error('Client metadata is not a JSON object');
	}

	const obj = data as Record<string, unknown>;

	if (obj.client_id !== clientIdUrl) {
		throw new Error('client_id in metadata does not match the requested URL');
	}

	if (!Array.isArray(obj.redirect_uris) || obj.redirect_uris.length === 0) {
		throw new Error('redirect_uris must be a non-empty array');
	}

	for (const uri of obj.redirect_uris) {
		if (typeof uri !== 'string') {
			throw new Error('All redirect_uris must be strings');
		}
		if (!isValidRedirectUriFormat(uri)) {
			throw new Error(`Invalid redirect URI format: ${uri}`);
		}
	}

	const metadata: ClientIdMetadata = {
		client_id: obj.client_id as string,
		redirect_uris: obj.redirect_uris as string[],
		...(typeof obj.client_name === 'string' ? { client_name: obj.client_name } : {}),
		...(typeof obj.client_uri === 'string' ? { client_uri: obj.client_uri } : {}),
		...(Array.isArray(obj.grant_types) ? { grant_types: obj.grant_types as string[] } : {}),
		...(Array.isArray(obj.response_types)
			? { response_types: obj.response_types as string[] }
			: {}),
		...(typeof obj.token_endpoint_auth_method === 'string'
			? { token_endpoint_auth_method: obj.token_endpoint_auth_method }
			: {})
	};

	CLIENT_METADATA_CACHE.set(clientIdUrl, { metadata, expiresAt: now + METADATA_CACHE_TTL_MS });

	return metadata;
}

export async function ensureUrlClientInDb(
	clientIdUrl: string,
	metadata: ClientIdMetadata
): Promise<OAuthClient> {
	const db = getDB();
	const normalizedUris = metadata.redirect_uris.map((uri) => uri.replace(/\/$/, ''));

	const existing = await getOAuthClient(clientIdUrl);

	if (!existing) {
		const [client] = await db
			.insert(oauthClients)
			.values({
				userId: null,
				clientId: clientIdUrl,
				clientSecretHash: null,
				tokenEndpointAuthMethod: 'none',
				clientName: metadata.client_name ?? null,
				allowedRedirectUris: normalizedUris
			})
			.returning();
		return client;
	}

	const [client] = await db
		.update(oauthClients)
		.set({
			allowedRedirectUris: normalizedUris,
			clientName: metadata.client_name ?? null
		})
		.where(eq(oauthClients.clientId, clientIdUrl))
		.returning();
	return client;
}
