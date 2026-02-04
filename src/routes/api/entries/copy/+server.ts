import { json } from '@sveltejs/kit';
import { copyEntries } from '$lib/server/entries';

export const POST = async ({ locals, url }) => {
	const fromDate = url.searchParams.get('fromDate');
	const toDate = url.searchParams.get('toDate');
	if (!fromDate || !toDate) {
		return json({ error: 'Missing fromDate or toDate' }, { status: 400 });
	}
	const entries = await copyEntries(locals.user!.id, fromDate, toDate);
	return json({ entries, count: entries.length });
};
