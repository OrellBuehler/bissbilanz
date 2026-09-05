import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listFastingSessions, upsertFastingSession } from '$lib/server/fasting';
import { handleApiError, requireAuth, unwrapResult, parseJsonBody } from '$lib/server/errors';
import { respondUpdate } from '$lib/server/sync/conflict';
import { readClientEditedAt } from '$lib/server/sync/headers';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = requireAuth(locals);
		const from = url.searchParams.get('from') ?? undefined;
		const to = url.searchParams.get('to') ?? undefined;
		const limitParam = url.searchParams.get('limit');
		const limit = limitParam ? Number(limitParam) : undefined;
		const sessions = await listFastingSessions(userId, {
			from,
			to,
			limit: Number.isFinite(limit) ? limit : undefined
		});
		return json({ sessions });
	} catch (error) {
		return handleApiError(error);
	}
};

export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		const userId = requireAuth(locals);
		const clientEditedAt = readClientEditedAt(request);
		const body = await parseJsonBody(request);
		const session = unwrapResult(await upsertFastingSession(userId, body, clientEditedAt));
		return respondUpdate({
			key: 'session',
			updated: session,
			clientEditedAt,
			resourceName: 'Fasting session',
			status: 201
		});
	} catch (error) {
		return handleApiError(error);
	}
};
