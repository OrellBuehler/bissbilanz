import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth, handleApiError } from '$lib/server/errors';
import { isValidBarcode } from '$lib/utils/barcode';
import { getDB } from '$lib/server/db';
import { catalogByBarcode } from '$lib/server/catalog/queries';

export const GET: RequestHandler = async ({ locals, params }) => {
	try {
		const userId = requireAuth(locals);
		const { code } = params;
		if (!isValidBarcode(code)) {
			return json({ error: 'Invalid barcode format' }, { status: 400 });
		}
		const result = await catalogByBarcode(getDB(), userId, code);
		if (!result) return json({ found: false }, { status: 404 });
		return json({ found: true, result });
	} catch (error) {
		return handleApiError(error);
	}
};
