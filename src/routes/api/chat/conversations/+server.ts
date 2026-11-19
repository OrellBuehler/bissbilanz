import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ApiError, validationError } from '$lib/server/errors';
import {
	chatConversationCreateSchema,
	chatConversationListQuerySchema
} from '$lib/server/validation/chat';
import { chatRoute } from '$lib/server/claude/chat/http';
import { ChatRequestError } from '$lib/server/claude/chat/service';
import {
	createConversation,
	listConversations,
	serializeConversation
} from '$lib/server/claude/chat/store';

const readOptionalBody = async (request: Request): Promise<unknown> => {
	const raw = await request.text();
	if (raw.trim() === '') return {};
	try {
		return JSON.parse(raw);
	} catch {
		throw new ApiError(400, 'Invalid JSON body');
	}
};

export const GET: RequestHandler = chatRoute(async ({ userId, url }) => {
	const query = chatConversationListQuerySchema.safeParse({
		limit: url.searchParams.get('limit'),
		offset: url.searchParams.get('offset')
	});
	if (!query.success) return validationError(query.error);
	return json(await listConversations(userId, query.data.limit, query.data.offset));
});

export const POST: RequestHandler = chatRoute(async ({ userId, request }) => {
	const parsed = chatConversationCreateSchema.safeParse(await readOptionalBody(request));
	if (!parsed.success) return validationError(parsed.error);
	const result = await createConversation(userId, parsed.data);
	if ('conflict' in result) throw new ChatRequestError('conversation_exists');
	return json(
		{ conversation: serializeConversation(result.conversation) },
		{ status: result.created ? 201 : 200 }
	);
});
