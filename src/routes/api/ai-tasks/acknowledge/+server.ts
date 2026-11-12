import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { acknowledgeAiTasks } from '$lib/server/ai-tasks';
import { markRepliesRead } from '$lib/server/claude/tasks/replies';
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
		if (!result.data.replies) return json({ acknowledged });
		const repliesAcknowledged = await markRepliesRead(userId, result.data.ids);
		return json({ acknowledged, repliesAcknowledged });
	} catch (error) {
		return handleApiError(error);
	}
};
