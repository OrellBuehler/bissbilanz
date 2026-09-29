import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull, lt, or } from 'drizzle-orm';
import { getDB, sessions, users, type Session, type User } from './db';
import { config } from './env';
import { encryptToken } from './token-crypto';

export async function getUserById(userId: string): Promise<User | null> {
	const db = getDB();
	const [user] = await db.select().from(users).where(eq(users.id, userId));
	return user ?? null;
}

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function generateSessionId(): string {
	return crypto.randomUUID();
}

export function hashSessionToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

/** The session row plus the raw cookie value, which is never stored. */
export type CreatedSession = Session & { token: string };

export async function createSession(
	userId: string,
	refreshToken?: string
): Promise<CreatedSession> {
	const db = getDB();
	const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

	const encryptedRefreshToken = refreshToken
		? await encryptToken(refreshToken, config.session.secret)
		: null;

	const token = randomBytes(32).toString('base64url');

	const [session] = await db
		.insert(sessions)
		.values({
			userId,
			refreshToken: encryptedRefreshToken,
			tokenHash: hashSessionToken(token),
			expiresAt
		})
		.returning();

	return { ...session, token };
}

/**
 * Sessions created before token hashing have the cookie value as their primary
 * key and no hash. Look up by hash first; fall back to that legacy id and move the
 * row to a fresh id + hash so the plaintext cookie value stops being stored.
 * Legacy rows expire within 7 days, after which this fallback can be removed.
 */
async function findSessionRow(token: string) {
	const db = getDB();
	const tokenHash = hashSessionToken(token);

	const selectByHash = async () => {
		const [row] = await db
			.select({ session: sessions, user: users })
			.from(sessions)
			.innerJoin(users, eq(sessions.userId, users.id))
			.where(eq(sessions.tokenHash, tokenHash));
		return row;
	};

	const byHash = await selectByHash();
	if (byHash || !UUID_RE.test(token)) return byHash;

	const [upgraded] = await db
		.update(sessions)
		.set({ id: crypto.randomUUID(), tokenHash })
		.where(and(eq(sessions.id, token), isNull(sessions.tokenHash)))
		.returning();
	if (!upgraded) return selectByHash();

	const [user] = await db.select().from(users).where(eq(users.id, upgraded.userId));
	return user ? { session: upgraded, user } : undefined;
}

export async function getSession(token: string): Promise<Session | null> {
	const row = await findSessionRow(token);
	if (!row || row.session.expiresAt < new Date()) {
		return null;
	}
	return row.session;
}

export async function getSessionWithUser(
	token: string
): Promise<{ session: Session; user: User } | null> {
	const row = await findSessionRow(token);
	if (!row || row.session.expiresAt < new Date()) {
		return null;
	}

	return { session: row.session, user: row.user };
}

export async function deleteSession(token: string): Promise<void> {
	const db = getDB();
	const tokenHash = hashSessionToken(token);
	await db
		.delete(sessions)
		.where(
			UUID_RE.test(token)
				? or(
						eq(sessions.tokenHash, tokenHash),
						and(eq(sessions.id, token), isNull(sessions.tokenHash))
					)
				: eq(sessions.tokenHash, tokenHash)
		);
}

export async function deleteUserSessions(userId: string): Promise<void> {
	const db = getDB();
	await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function cleanExpiredSessions(): Promise<number> {
	const db = getDB();
	const deleted = await db
		.delete(sessions)
		.where(lt(sessions.expiresAt, new Date()))
		.returning({ id: sessions.id });
	return deleted.length;
}

type SameSiteValue = 'lax' | 'strict' | 'none' | 'Lax' | 'Strict' | 'None';

function formatSameSite(value?: SameSiteValue): 'Lax' | 'Strict' | 'None' {
	switch (value) {
		case 'strict':
		case 'Strict':
			return 'Strict';
		case 'none':
		case 'None':
			return 'None';
		default:
			return 'Lax';
	}
}

export function createSessionCookie(
	sessionId: string,
	options?: { secure?: boolean; sameSite?: SameSiteValue }
): string {
	const secure = options?.secure ?? config.app.secureCookies;
	const sameSite = formatSameSite(options?.sameSite);
	return [
		`session=${sessionId}`,
		'Path=/',
		'HttpOnly',
		`SameSite=${sameSite}`,
		secure ? 'Secure' : '',
		`Max-Age=${SESSION_DURATION_MS / 1000}`
	]
		.filter(Boolean)
		.join('; ');
}

export function clearSessionCookie(options?: {
	secure?: boolean;
	sameSite?: SameSiteValue;
}): string {
	const secure = options?.secure ?? config.app.secureCookies;
	const sameSite = formatSameSite(options?.sameSite);
	return [
		'session=',
		'Path=/',
		'HttpOnly',
		`SameSite=${sameSite}`,
		secure ? 'Secure' : '',
		'Max-Age=0'
	]
		.filter(Boolean)
		.join('; ');
}

export function parseSessionCookie(cookieHeader: string | null): string | null {
	if (!cookieHeader) return null;
	const match = cookieHeader.match(/session=([^;]+)/);
	return match ? match[1] : null;
}
