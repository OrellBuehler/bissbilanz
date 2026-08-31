import type { RequestHandler } from './$types';
import { deleteAiTask, serializeAiTask, updateAiTask } from '$lib/server/ai-tasks';
import { unwrapResult, parseJsonBody, withAuthedResource } from '$lib/server/errors';
import { respondUpdate } from '$lib/server/sync/conflict';

export const PATCH: RequestHandler = withAuthedResource(
	async ({ userId, id, request, clientEditedAt }) => {
		const body = await parseJsonBody(request);
		const task = unwrapResult(await updateAiTask(userId, id, body, clientEditedAt));
		return respondUpdate({
			key: 'task',
			updated: task && serializeAiTask(task),
			clientEditedAt,
			resourceName: 'AI task'
		});
	}
);

export const DELETE: RequestHandler = withAuthedResource(async ({ userId, id }) => {
	await deleteAiTask(userId, id);
	return new Response(null, { status: 204 });
});
