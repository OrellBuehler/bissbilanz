import { json, error } from '@sveltejs/kit';
import { unlinkIdentity, LastIdentityError } from '$lib/server/auth-account';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	try {
		await unlinkIdentity(locals.user.id, params.id);
	} catch (e) {
		if (e instanceof LastIdentityError) {
			throw error(409, 'Cannot disconnect the last sign-in method');
		}
		throw e;
	}

	return json({ ok: true });
};
