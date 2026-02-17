import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { logSupplement } from '$lib/server/supplements';
import { supplementLogSchema } from '$lib/server/validation';
import { today } from '$lib/utils/dates';
import { handleApiError, requireAuth, validationError } from '$lib/server/errors';

export const POST: RequestHandler = async ({ locals, params, request }) => {
	try {
		const userId = requireAuth(locals);
		const body = await request.json().catch(() => ({}));

		const parsed = supplementLogSchema.safeParse(body);
		if (!parsed.success) {
			return validationError(parsed.error);
		}

		const date = parsed.data.date ?? today();
		const result = await logSupplement(userId, params.id, date);

		if (!result.success) {
			if (result.error.message === 'Supplement not found') {
				return json({ error: 'Supplement not found' }, { status: 404 });
			}
			throw result.error;
		}

		return json({ log: result.data }, { status: 201 });
	} catch (error) {
		return handleApiError(error);
	}
};
