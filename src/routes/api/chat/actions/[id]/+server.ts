import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parseJsonBody, validationError } from '$lib/server/errors';
import { chatActionDecisionSchema } from '$lib/server/validation/chat';
import { chatRoute } from '$lib/server/claude/chat/http';
import { decideAction } from '$lib/server/claude/chat/service';

export const POST: RequestHandler = chatRoute(async ({ userId, params, request }) => {
	const parsed = chatActionDecisionSchema.safeParse(await parseJsonBody(request));
	if (!parsed.success) return validationError(parsed.error);
	return json(await decideAction(userId, params.id, parsed.data.decision));
});
