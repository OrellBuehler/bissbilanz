import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { acknowledgeAiTasks } from '$lib/server/ai-tasks';
import { aiTaskAcknowledgeSchema } from '$lib/server/validation';
import { handleApiError, requireAuth, validationError, parseJsonBody } from '$lib/server/errors';

export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		const userId = requireAuth(locals);
		const body = await parseJsonBody(request);

		const result = aiTaskAcknowledgeSchema.safeParse(body ?? {});
		if (!result.success) {
			return validationError(result.error);
		}

		const acknowledged = await acknowledgeAiTasks(userId, result.data.ids);
		return json({ acknowledged });
	} catch (error) {
		return handleApiError(error);
	}
};
