import { randomBytes, createHash } from 'crypto';
import { compareSync, hashSync } from 'bcrypt';
import { eq, and, gt, lt } from 'drizzle-orm';
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
	return hash === codeChallenge;
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
		where: and(
			eq(oauthAuthorizations.userId, userId),
			eq(oauthAuthorizations.clientId, clientId)
		)
	});
	return !!authorization;
}

export async function createAuthorization(
	userId: string,
	clientId: string
): Promise<OAuthAuthorization> {
	const db = getDB();

	const existing = await db.query.oauthAuthorizations.findFirst({
		where: and(
			eq(oauthAuthorizations.userId, userId),
			eq(oauthAuthorizations.clientId, clientId)
		)
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

	const authCode = await db.query.oauthAuthorizationCodes.findFirst({
		where: eq(oauthAuthorizationCodes.code, codeHash)
	});

	if (!authCode) return undefined;
	if (authCode.usedAt) return undefined;
	if (authCode.expiresAt < new Date()) return undefined;
	if (authCode.clientId !== clientId) return undefined;
	if (authCode.redirectUri !== redirectUri) return undefined;

	const pkceValid = verifyPKCE(codeVerifier, authCode.codeChallenge);
	if (!pkceValid) return undefined;

	await db
		.update(oauthAuthorizationCodes)
		.set({ usedAt: new Date() })
		.where(eq(oauthAuthorizationCodes.code, codeHash));

	return authCode.userId;
}

function hashAccessToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export async function createAccessToken(
	userId: string,
	clientId: string
): Promise<{ accessToken: string; refreshToken: string }> {
	const db = getDB();

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

	const tokenRecord = await db.query.oauthTokens.findFirst({
		where: and(
			eq(oauthTokens.refreshTokenHash, tokenHash),
			eq(oauthTokens.clientId, clientId),
			gt(oauthTokens.refreshTokenExpiresAt, now)
		)
	});

	if (!tokenRecord) return undefined;

	await db.delete(oauthTokens).where(eq(oauthTokens.id, tokenRecord.id));

	const result = await createAccessToken(tokenRecord.userId, clientId);
	return { ...result, userId: tokenRecord.userId };
}

export async function validateAccessToken(
	token: string
): Promise<{ userId: string; clientId: string } | undefined> {
	const db = getDB();

	const tokenHash = hashAccessToken(token);
	const now = new Date();

	const tokenRecord = await db.query.oauthTokens.findFirst({
		where: and(eq(oauthTokens.accessTokenHash, tokenHash), gt(oauthTokens.expiresAt, now))
	});

	if (!tokenRecord) return undefined;

	return {
		userId: tokenRecord.userId,
		clientId: tokenRecord.clientId
	};
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
