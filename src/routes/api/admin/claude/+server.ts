import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/admin/guard';
import { requireAdminActor } from '$lib/server/admin/claude-access';
import { getClaudeOverview } from '$lib/server/admin/users';
import { emitClaudeAccessChanged } from '$lib/server/claude/events';
import { setClaudeEnabled } from '$lib/server/claude/settings';
import { getDB } from '$lib/server/db';
import { handleApiError, parseJsonBody, validationError } from '$lib/server/errors';
import { adminClaudeSettingsUpdateSchema } from '$lib/server/validation/admin';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		requireAdmin(locals);
		return json(await getClaudeOverview(getDB()));
	} catch (error) {
		return handleApiError(error);
	}
};

export const PATCH: RequestHandler = async ({ locals, request }) => {
	try {
		const actor = requireAdminActor(locals);

		const body = adminClaudeSettingsUpdateSchema.safeParse(await parseJsonBody(request));
		if (!body.success) return validationError(body.error);

		const { changed } = await setClaudeEnabled(getDB(), actor, body.data.enabled);
		if (changed) emitClaudeAccessChanged({});
		return json({ enabled: body.data.enabled });
	} catch (error) {
		return handleApiError(error);
	}
};
