import { eq, inArray, lt } from 'drizzle-orm';
import { getDB, sessions, users, type Session, type User } from './db';
import { config } from './env';
import { encryptToken } from './token-crypto';

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function generateSessionId(): string {
	return crypto.randomUUID();
}

export async function createSession(userId: string, refreshToken?: string): Promise<Session> {
	const db = getDB();
	const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

	const encryptedRefreshToken = refreshToken
		? await encryptToken(refreshToken, config.session.secret)
		: null;

	const [session] = await db
		.insert(sessions)
		.values({
			userId,
			refreshToken: encryptedRefreshToken,
			expiresAt
		})
		.returning();

	return session;
}

export async function getSession(sessionId: string): Promise<Session | null> {
	const db = getDB();
	const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));

	if (!session || session.expiresAt < new Date()) {
		return null;
	}

	return session;
}

export async function getSessionWithUser(
	sessionId: string
): Promise<{ session: Session; user: User } | null> {
	const db = getDB();
	const result = await db
		.select({
			session: sessions,
			user: users
		})
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.where(eq(sessions.id, sessionId));

	const [row] = result;
	if (!row || row.session.expiresAt < new Date()) {
		return null;
	}

	return { session: row.session, user: row.user };
}

export async function deleteSession(sessionId: string): Promise<void> {
	const db = getDB();
	await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function deleteUserSessions(userId: string): Promise<void> {
	const db = getDB();
	await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function cleanExpiredSessions(batchSize = 500): Promise<number> {
	const db = getDB();
	const expired = await db
		.select({ id: sessions.id })
		.from(sessions)
		.where(lt(sessions.expiresAt, new Date()))
		.limit(batchSize);

	if (expired.length === 0) return 0;

	const ids = expired.map((row) => row.id);
	await db.delete(sessions).where(inArray(sessions.id, ids));
	return ids.length;
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
	const secure = options?.secure ?? config.infomaniak.redirectUri.startsWith('https');
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
	const secure = options?.secure ?? config.infomaniak.redirectUri.startsWith('https');
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
