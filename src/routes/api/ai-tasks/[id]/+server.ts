import * as Sentry from '@sentry/sveltekit';
import type { RequestHandler } from './$types';
import { deleteAiTask, getAiTask, updateAiTask } from '$lib/server/ai-tasks';
import { unwrapResult, parseJsonBody, withAuthedResource } from '$lib/server/errors';
import { respondUpdate } from '$lib/server/sync/conflict';
import {
	enqueueClaudeTaskIfEligible,
	requeueRunForEditedTask
} from '$lib/server/claude/tasks/executor';
import { serializeAiTaskWithRun } from '$lib/server/claude/tasks/serialize';

const CONTENT_FIELDS = ['description', 'photoUrls', 'date', 'mealType', 'eatenAt'];

const asRecord = (body: unknown): Record<string, unknown> =>
	typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};

const editsContent = (body: Record<string, unknown>) =>
	CONTENT_FIELDS.some((field) => body[field] !== undefined);

export const PATCH: RequestHandler = withAuthedResource(
	async ({ userId, id, request, clientEditedAt }) => {
		const body = await parseJsonBody(request);
		const fields = asRecord(body);
		const previousStatus =
			fields.status === 'pending' ? (await getAiTask(userId, id))?.status : undefined;
		const task = unwrapResult(await updateAiTask(userId, id, body, clientEditedAt));
		if (task?.status === 'pending') {
			const reopened = fields.status === 'pending' && previousStatus !== 'pending';
			if (reopened || editsContent(fields)) {
				try {
					await requeueRunForEditedTask(id, { reopened });
					if (reopened) await enqueueClaudeTaskIfEligible(userId, id);
				} catch (error) {
					Sentry.captureException(error, {
						tags: { job: 'claude-requeue' },
						extra: { taskId: id }
					});
				}
			}
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
