import { json } from '@sveltejs/kit';
import * as Sentry from '@sentry/sveltekit';
import type { RequestHandler } from './$types';
import { createAiTask, listAiTasks, serializeAiTask } from '$lib/server/ai-tasks';
import { aiTaskListQuerySchema } from '$lib/server/validation';
import {
	ApiError,
	handleApiError,
	isZodError,
	requireAuth,
	unwrapResult,
	validationError,
	parseJsonBody
} from '$lib/server/errors';
import { readIdempotencyKey } from '$lib/server/sync/headers';

/**
 * A meal that never reaches the queue is invisible to the user, so every
 * outcome of this endpoint is logged: the mobile apps upload in the background
 * and drop most network errors from their own reporting.
 */
const logRejected = (request: Request, error: unknown, source: unknown) => {
	if (error instanceof ApiError && error.status === 401) {
		Sentry.logger.warn('AI task request unauthenticated', {
			path: new URL(request.url).pathname,
			userAgent: request.headers.get('user-agent') ?? ''
		});
		return;
	}
	if (isZodError(error) || error instanceof ApiError) {
		Sentry.logger.warn('AI task create rejected', {
			source: typeof source === 'string' ? source : '',
			reason: isZodError(error)
				? error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
				: error.message
		});
	}
};

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
	let source: unknown;
	try {
		const userId = requireAuth(locals);
		const body = await parseJsonBody(request);
		source = (body as { source?: unknown } | null)?.source;

		const result = await createAiTask(userId, body);
		if (!result.success) logRejected(request, result.error, source);
		const task = unwrapResult(result);
		Sentry.logger.info('AI task created', {
			taskId: task.id,
			source: task.source ?? '',
			photoCount: task.photoUrls?.length ?? 0,
			hasDescription: !!task.description,
			date: task.date,
			idempotent: readIdempotencyKey(request) !== null
		});
		return json({ task: serializeAiTask(task) }, { status: 201 });
	} catch (error) {
		logRejected(request, error, source);
		return handleApiError(error);
	}
};
