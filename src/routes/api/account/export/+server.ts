import type { RequestHandler } from './$types';
import { buildAccountExport } from '$lib/server/export';
import { handleApiError, requireAuth } from '$lib/server/errors';
import { rateLimit } from '$lib/server/rate-limit';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const userId = requireAuth(locals);
		rateLimit(`account:export:${userId}`, 5, 3_600_000);

		const archive = await buildAccountExport(userId);
		const date = new Date().toISOString().slice(0, 10);
		return new Response(new Blob([archive]), {
			headers: {
				'Content-Type': 'application/zip',
				'Content-Disposition': `attachment; filename="bissbilanz-export-${date}.zip"`,
				'Cache-Control': 'no-store'
			}
		});
	} catch (error) {
		return handleApiError(error);
	}
};
