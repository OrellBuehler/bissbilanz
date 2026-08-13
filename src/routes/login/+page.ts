import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, data }) => {
	const response = await fetch('/api/auth/me');
	if (!response.ok) {
		return data;
	}
	const body = await response.json();

	if (body.user) {
		throw redirect(302, '/');
	}

	return data;
};
