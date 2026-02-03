import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ fetch }) => {
	const response = await fetch('/api/auth/me');
	const data = await response.json();

	if (!data.user) {
		throw redirect(302, '/');
	}

	return {
		user: data.user
	};
};
