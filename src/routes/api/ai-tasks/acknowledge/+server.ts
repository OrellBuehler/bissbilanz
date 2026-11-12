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

		const { ids, replyIds } = result.data;
		if (!replyIds) return json({ acknowledged: await acknowledgeAiTasks(userId, ids) });
		// With replyIds the client names what it showed, so tasks are only
		// acknowledged when it names those too; an empty body keeps meaning "all".
		const acknowledged = ids ? await acknowledgeAiTasks(userId, ids) : 0;
		const repliesAcknowledged = await markRepliesRead(userId, replyIds);
		return json({ acknowledged, repliesAcknowledged });
	} catch (error) {
		return handleApiError(error);
	}
};
