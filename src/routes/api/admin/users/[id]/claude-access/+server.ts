import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdminActor, updateClaudeAccess } from '$lib/server/admin/claude-access';
import { getDB } from '$lib/server/db';
import { handleApiError, parseJsonBody, requireUuid, validationError } from '$lib/server/errors';
import { adminClaudeAccessUpdateSchema } from '$lib/server/validation/admin';

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	try {
		const actor = requireAdminActor(locals);
		const id = requireUuid(params.id);

		const body = adminClaudeAccessUpdateSchema.safeParse(await parseJsonBody(request));
		if (!body.success) return validationError(body.error);

		const access = await updateClaudeAccess(getDB(), actor, id, body.data);
		return json({ access });
	} catch (error) {
		return handleApiError(error);
	}
};
