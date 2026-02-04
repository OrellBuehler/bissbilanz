import { json } from '@sveltejs/kit';
import { listRecentFoods } from '$lib/server/foods';
import { uniqueById } from '$lib/utils/recents';

export const GET = async ({ locals }) => {
	const recentFoods = await listRecentFoods(locals.user!.id);
	const foods = uniqueById(recentFoods);
	return json({ foods });
};
