import { isValidIsoDate, today } from '$lib/utils/dates';
import type { PageLoad } from './$types';

export const ssr = false;

export const load: PageLoad = ({ url }) => {
	const dateParam = url.searchParams.get('date');
	const date = dateParam && isValidIsoDate(dateParam) ? dateParam : today();
	return { date };
};
