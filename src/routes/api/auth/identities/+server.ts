import { json, error } from '@sveltejs/kit';
import { listIdentities } from '$lib/server/auth-account';
import { enabledProviderIds } from '$lib/server/auth-providers';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const identities = await listIdentities(locals.user.id);

	return json({
		identities: identities.map((identity) => ({
			id: identity.id,
			provider: identity.provider,
			email: identity.email,
			createdAt: identity.createdAt
		})),
		available: enabledProviderIds()
	});
};
