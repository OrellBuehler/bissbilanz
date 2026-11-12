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
import { NOT_REPLAYABLE_HEADER } from '$lib/server/sync/idempotency';

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

const reply = withAuthedResource(async ({ userId, id, request }) => {
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

// Only a created reply is replayed under its Idempotency-Key. A rejection
// changed nothing and depends on the moment (a correction in flight, the rate
// limit), so a retry with the same key is decided again.
export const POST: RequestHandler = async (event) => {
	const response = await reply(event);
	if (response.status !== 201) response.headers.set(NOT_REPLAYABLE_HEADER, '1');
	return response;
};
