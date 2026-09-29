import { error, redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ fetch }) => {
	const response = await fetch('/api/auth/me');
	if (response.status === 401) {
		throw redirect(302, '/login');
	}
	if (!response.ok) {
		throw error(response.status, 'Failed to load session');
	}
	const data = await response.json();

	if (!data.user) {
		throw redirect(302, '/login');
	}

	return {
		user: data.user
	};
};
