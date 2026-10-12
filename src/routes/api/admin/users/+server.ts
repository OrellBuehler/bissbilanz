import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/admin/guard';
import { listAdminUsers } from '$lib/server/admin/users';
import { getDB } from '$lib/server/db';
import { handleApiError, validationError } from '$lib/server/errors';
import { adminUserListQuerySchema } from '$lib/server/validation/admin';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		requireAdmin(locals);

		const params = url.searchParams;
		const query = adminUserListQuerySchema.safeParse({
			q: params.get('q'),
			access: params.get('access'),
			sort: params.get('sort'),
			order: params.get('order'),
			limit: params.get('limit'),
			offset: params.get('offset')
		});
		if (!query.success) return validationError(query.error);

		return json(await listAdminUsers(getDB(), query.data));
	} catch (error) {
		return handleApiError(error);
	}
};
