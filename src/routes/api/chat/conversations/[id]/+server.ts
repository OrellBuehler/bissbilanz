import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parseJsonBody, validationError } from '$lib/server/errors';
import { chatConversationUpdateSchema } from '$lib/server/validation/chat';
import { chatRoute } from '$lib/server/claude/chat/http';
import {
	ChatRequestError,
	deleteConversation,
	getConversationDetail
} from '$lib/server/claude/chat/service';
import { renameConversation, serializeConversation } from '$lib/server/claude/chat/store';

export const GET: RequestHandler = chatRoute(async ({ userId, params }) =>
	json(await getConversationDetail(userId, params.id))
);

export const PATCH: RequestHandler = chatRoute(async ({ userId, params, request }) => {
	const parsed = chatConversationUpdateSchema.safeParse(await parseJsonBody(request));
	if (!parsed.success) return validationError(parsed.error);
	const conversation = await renameConversation(userId, params.id, parsed.data.title);
	if (!conversation) throw new ChatRequestError('conversation_not_found');
	return json({ conversation: serializeConversation(conversation) });
});

export const DELETE: RequestHandler = chatRoute(async ({ userId, params }) => {
	await deleteConversation(userId, params.id);
	return new Response(null, { status: 204 });
});
