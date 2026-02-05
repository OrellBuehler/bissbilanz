import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteEntry, updateEntry } from '$lib/server/entries';

export const PATCH: RequestHandler = async ({ locals, request, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	const body = await request.json();
	const entry = await updateEntry(locals.user.id, params.id, body);
	return json({ entry });
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	await deleteEntry(locals.user.id, params.id);
	return new Response(null, { status: 204 });
};
