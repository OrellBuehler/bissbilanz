import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { chatRoute } from '$lib/server/claude/chat/http';
import { cancelRun } from '$lib/server/claude/chat/service';

export const POST: RequestHandler = chatRoute(async ({ userId, params }) =>
	json(await cancelRun(userId, params.id))
);
