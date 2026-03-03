import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listSupplements, createSupplement } from '$lib/server/supplements';
import { handleApiError, requireAuth, unwrapResult } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = requireAuth(locals);
		const all = url.searchParams.get('all') === 'true';
		const supplements = await listSupplements(userId, !all);
		return json({ supplements });
	} catch (error) {
		return handleApiError(error);
	}
};

export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		const userId = requireAuth(locals);
		const body = await request.json();
		const supplement = unwrapResult(await createSupplement(userId, body));
		return json({ supplement }, { status: 201 });
	} catch (error) {
		return handleApiError(error);
	}
};
