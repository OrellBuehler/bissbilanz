import { json } from '@sveltejs/kit';
import { enabledProviderIds } from '$lib/server/auth-providers';
import type { RequestHandler } from './$types';

// Deliberately public (no auth check): the mobile login screens call this
// before any session exists to decide which provider buttons to show.
export const GET: RequestHandler = () => {
	return json({ providers: enabledProviderIds() });
};
