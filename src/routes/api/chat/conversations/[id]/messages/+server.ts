import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parseJsonBody, validationError } from '$lib/server/errors';
import { chatMessageCreateSchema } from '$lib/server/validation/chat';
import { chatRoute } from '$lib/server/claude/chat/http';
import { postMessage } from '$lib/server/claude/chat/service';
import { NOT_REPLAYABLE_HEADER } from '$lib/server/sync/idempotency';

const send = chatRoute<Parameters<RequestHandler>[0]>(async ({ userId, params, request }) => {
	const parsed = chatMessageCreateSchema.safeParse(await parseJsonBody(request));
	if (!parsed.success) return validationError(parsed.error);
	const { message, run, seq } = await postMessage(userId, params.id, parsed.data);
	return json({ message, run, seq }, { status: 202 });
});

// The message id is the idempotency key. Should a client still send an
// Idempotency-Key, only an accepted message is stored for replay; a rejection
// depends on the moment (an active run, the daily limit) and is decided again.
export const POST: RequestHandler = async (event) => {
	const response = await send(event);
	if (response.status !== 202) response.headers.set(NOT_REPLAYABLE_HEADER, '1');
	return response;
};
