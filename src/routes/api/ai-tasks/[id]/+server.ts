import type { RequestHandler } from './$types';
import { deleteAiTask, updateAiTask } from '$lib/server/ai-tasks';
import { unwrapResult, parseJsonBody, withAuthedResource } from '$lib/server/errors';
import { respondUpdate } from '$lib/server/sync/conflict';
import {
	enqueueClaudeTaskIfEligible,
	requeueRunForEditedTask
} from '$lib/server/claude/tasks/executor';
import { serializeAiTaskWithRun } from '$lib/server/claude/tasks/serialize';

const requestsReopen = (body: unknown) =>
	typeof body === 'object' && body !== null && (body as { status?: unknown }).status === 'pending';

export const PATCH: RequestHandler = withAuthedResource(
	async ({ userId, id, request, clientEditedAt }) => {
		const body = await parseJsonBody(request);
		const task = unwrapResult(await updateAiTask(userId, id, body, clientEditedAt));
		if (task?.status === 'pending') {
			const reopened = requestsReopen(body);
			await requeueRunForEditedTask(id, { reopened });
			if (reopened) await enqueueClaudeTaskIfEligible(userId, id);
		}
		return respondUpdate({
			key: 'task',
			updated: task && (await serializeAiTaskWithRun(task)),
			clientEditedAt,
			resourceName: 'AI task'
		});
	}
);

export const DELETE: RequestHandler = withAuthedResource(async ({ userId, id }) => {
	await deleteAiTask(userId, id);
	return new Response(null, { status: 204 });
});
