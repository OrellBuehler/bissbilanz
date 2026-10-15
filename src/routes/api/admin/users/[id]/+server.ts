import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/admin/guard';
import { getAdminUserDetail } from '$lib/server/admin/users';
import { getDB } from '$lib/server/db';
import { handleApiError, requireUuid, validationError } from '$lib/server/errors';
import { adminUserDetailQuerySchema } from '$lib/server/validation/admin';

export const GET: RequestHandler = async ({ locals, params, url }) => {
	try {
		requireAdmin(locals);
		const id = requireUuid(params.id);

		const query = adminUserDetailQuerySchema.safeParse({ days: url.searchParams.get('days') });
		if (!query.success) return validationError(query.error);

		return json(await getAdminUserDetail(getDB(), id, query.data.days));
	} catch (error) {
		return handleApiError(error);
	}
};
