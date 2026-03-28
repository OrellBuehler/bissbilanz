import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getDB, users } from '$lib/server/db';
import { createSession } from '$lib/server/session';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies }) => {
	if (!import.meta.env.DEV || process.env.PLAYWRIGHT_TEST_AUTH_BYPASS !== 'true') {
		throw error(404, 'Not found');
	}

	const db = getDB();

	let [user] = await db.select().from(users).where(eq(users.infomaniakSub, 'playwright-test'));

	if (!user) {
		[user] = await db
			.insert(users)
			.values({
				infomaniakSub: 'playwright-test',
				email: 'test@playwright.local',
				name: 'Playwright Test',
				locale: 'en'
			})
			.returning();
	}

	const session = await createSession(user.id);

	cookies.set('session', session.id, {
		path: '/',
		httpOnly: true,
		secure: false,
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 7
	});

	cookies.set('PARAGLIDE_LOCALE', 'en', {
		path: '/',
		maxAge: 34560000,
		httpOnly: false,
		secure: false,
		sameSite: 'lax'
	});

	return json({ ok: true });
};
