import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { isAdminSession } from '$lib/server/admin/guard';

export const load: LayoutServerLoad = ({ locals }) => {
	if (!isAdminSession(locals)) error(404, 'Not found');
};
