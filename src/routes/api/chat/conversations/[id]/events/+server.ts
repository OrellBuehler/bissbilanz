import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { validationError } from '$lib/server/errors';
import { rateLimit } from '$lib/server/rate-limit';
import { getDB } from '$lib/server/db';
import { chatEventsQuerySchema } from '$lib/server/validation/chat';
import { EVENTS_RATE_LIMIT_PER_MINUTE } from '$lib/server/claude/chat/constants';
import { listEvents } from '$lib/server/claude/chat/events';
import { reconcileConversation } from '$lib/server/claude/chat/executor';
import { chatRoute } from '$lib/server/claude/chat/http';
import { ChatRequestError } from '$lib/server/claude/chat/service';
import { getActiveRun, getConversation, serializeRun } from '$lib/server/claude/chat/store';
import { chatEventStream } from '$lib/server/claude/chat/stream';

const lastEventId = (request: Request): number => {
	const value = Number(request.headers.get('last-event-id'));
	return Number.isInteger(value) && value > 0 ? value : 0;
};

// GETs are not counted by the shared write limit; polling gets its own bucket.
export const GET: RequestHandler = chatRoute(async ({ userId, params, url, request }) => {
	rateLimit(`chat-events:${userId}`, EVENTS_RATE_LIMIT_PER_MINUTE, 60_000);
	const query = chatEventsQuerySchema.safeParse({
		after: url.searchParams.get('after'),
		limit: url.searchParams.get('limit')
	});
	if (!query.success) return validationError(query.error);
	const db = getDB();
	if (!(await getConversation(db, userId, params.id))) {
		throw new ChatRequestError('conversation_not_found');
	}
	await reconcileConversation(params.id);
	const after = Math.max(query.data.after, lastEventId(request));

	if (request.headers.get('accept')?.includes('text/event-stream')) {
		return new Response(chatEventStream(userId, params.id, after, request.signal), {
			headers: {
				'Content-Type': 'text/event-stream; charset=utf-8',
				'Cache-Control': 'no-cache, no-transform',
				'X-Accel-Buffering': 'no'
			}
		});
	}

	const { limit } = query.data;
	const page = await listEvents(params.id, after, limit + 1);
	const events = page.slice(0, limit);
	const [conversation, activeRun] = await Promise.all([
		getConversation(db, userId, params.id),
		getActiveRun(db, params.id)
	]);
	return json({
		events,
		nextAfter: events.length > 0 ? events[events.length - 1]!.seq : after,
		lastSeq: conversation?.nextSeq ?? after,
		hasMore: page.length > limit,
		activeRun: activeRun ? serializeRun(activeRun) : null
	});
});
