import { json } from '@sveltejs/kit';
import { createEntry, listEntriesByDate } from '$lib/server/entries';

export const GET = async ({ locals, url }) => {
	const date = url.searchParams.get('date');
	if (!date) return json({ error: 'Missing date' }, { status: 400 });
	const entries = await listEntriesByDate(locals.user.id, date);
	return json({ entries });
};

export const POST = async ({ locals, request }) => {
	const body = await request.json();
	const entry = await createEntry(locals.user.id, body);
	return json({ entry }, { status: 201 });
};
