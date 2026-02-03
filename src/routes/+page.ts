import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
	const response = await fetch('/api/auth/me');
	const data = await response.json();

	if (data.user) {
		throw redirect(302, '/app');
	}

	return {};
};
