import { isValidIsoDate, today } from '$lib/utils/dates';
import type { PageLoad } from './$types';

export const ssr = false;

export const load: PageLoad = ({ url }) => {
	const dateParam = url.searchParams.get('date');
	const date = dateParam && isValidIsoDate(dateParam) ? dateParam : today();
	// Set by "where it's logged" lists so the entry can be scrolled to and highlighted.
	const entry = url.searchParams.get('entry');
	return { date, entry: entry && /^[0-9a-f-]{36}$/i.test(entry) ? entry : null };
};
