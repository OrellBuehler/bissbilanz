import { json } from '@sveltejs/kit';
import { deleteEntry, updateEntry } from '$lib/server/entries';

export const PATCH = async ({ locals, request, params }) => {
	const body = await request.json();
	const entry = await updateEntry(locals.user.id, params.id, body);
	return json({ entry });
};

export const DELETE = async ({ locals, params }) => {
	await deleteEntry(locals.user.id, params.id);
	return new Response(null, { status: 204 });
};
