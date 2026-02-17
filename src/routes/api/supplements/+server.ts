import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listSupplements, createSupplement } from '$lib/server/supplements';
import { handleApiError, requireAuth, isZodError, validationError } from '$lib/server/errors';

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
		const result = await createSupplement(userId, body);

		if (!result.success) {
			if (isZodError(result.error)) {
				return validationError(result.error);
			}
			throw result.error;
		}

		return json({ supplement: result.data }, { status: 201 });
	} catch (error) {
		return handleApiError(error);
	}
};
