import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { getDB } from '$lib/server/db';
import { config } from '$lib/server/env';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		await getDB().execute(sql`SELECT 1`);
	} catch (err) {
		console.error('[health] Database check failed:', err);
		return json({ status: 'degraded' }, { status: 503 });
	}
	return json({ status: 'ok', version: config.app.version });
};
