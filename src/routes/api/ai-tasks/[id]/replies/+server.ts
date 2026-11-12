import * as Sentry from '@sentry/sveltekit';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	parseJsonBody,
	rateLimitedResponse,
	RateLimitError,
	validationError,
	withAuthedResource
} from '$lib/server/errors';
import { aiTaskReplyCreateSchema } from '$lib/server/validation';
import { postTaskReply, ReplyRejectedError } from '$lib/server/claude/tasks/replies';
import { serializeAiTaskWithRun } from '$lib/server/claude/tasks/serialize';

const rejected = (error: ReplyRejectedError) => {
	Sentry.addBreadcrumb({
		category: 'ai-task-reply',
		level: 'info',
		message: 'AI task reply rejected',
		data: { code: error.code }
	});
	const body = { error: error.message, code: error.code };
	if (error.code === 'rate_limited') {
		return rateLimitedResponse(new RateLimitError(error.retryAfterSeconds ?? 60), body);
	}
	return json(body, { status: error.status });
};

export const POST: RequestHandler = withAuthedResource(async ({ userId, id, request }) => {
	const parsed = aiTaskReplyCreateSchema.safeParse(await parseJsonBody(request));
	if (!parsed.success) return validationError(parsed.error);
	try {
		const task = await postTaskReply(userId, id, parsed.data.text);
		return json({ task: await serializeAiTaskWithRun(task) }, { status: 201 });
	} catch (error) {
		if (error instanceof ReplyRejectedError) return rejected(error);
		throw error;
	}
});
