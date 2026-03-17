import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
	const response = await fetch('/api/auth/me');
	if (!response.ok) {
		return {};
	}
	const data = await response.json();

	if (data.user) {
		throw redirect(302, '/');
	}

	return {};
};
