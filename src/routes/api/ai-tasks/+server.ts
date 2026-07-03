import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAiTask, listAiTasks } from '$lib/server/ai-tasks';
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
			limit: url.searchParams.get('limit'),
			offset: url.searchParams.get('offset')
		});

		if (!queryResult.success) {
			return validationError(queryResult.error);
		}

		const { status, limit, offset } = queryResult.data;
		const { tasks, total } = await listAiTasks(userId, { status, limit, offset });
		return json({ tasks, total });
	} catch (error) {
		return handleApiError(error);
	}
};

export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		const userId = requireAuth(locals);
		const body = await parseJsonBody(request);

		const task = unwrapResult(await createAiTask(userId, body));
		return json({ task }, { status: 201 });
	} catch (error) {
		return handleApiError(error);
	}
};
