import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAiTask, listAiTasks, serializeAiTask } from '$lib/server/ai-tasks';
import { aiTaskListQuerySchema } from '$lib/server/validation';
import {
	handleApiError,
	requireAuth,
	unwrapResult,
	validationError,
	parseJsonBody
} from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = requireAuth(locals);

		const queryResult = aiTaskListQuerySchema.safeParse({
			status: url.searchParams.get('status') ?? undefined,
			acknowledged: url.searchParams.get('acknowledged') ?? undefined,
			limit: url.searchParams.get('limit'),
			offset: url.searchParams.get('offset')
		});

		if (!queryResult.success) {
			return validationError(queryResult.error);
		}

		const { status, acknowledged, limit, offset } = queryResult.data;
		const { tasks, total } = await listAiTasks(userId, { status, acknowledged, limit, offset });
		return json({ tasks: tasks.map(serializeAiTask), total });
	} catch (error) {
		return handleApiError(error);
	}
};

export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		const userId = requireAuth(locals);
		const body = await parseJsonBody(request);

		const task = unwrapResult(await createAiTask(userId, body));
		return json({ task: serializeAiTask(task) }, { status: 201 });
	} catch (error) {
		return handleApiError(error);
	}
};
