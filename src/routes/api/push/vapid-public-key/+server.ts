import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { handleApiError, requireAuth } from '$lib/server/errors';
import { getVapidConfig } from '$lib/server/push/config';

// Reports whether Web Push is configured on this deployment; the settings UI
// keeps its Notifications section hidden while it is not.
export const GET: RequestHandler = ({ locals }) => {
	try {
		requireAuth(locals);
		const vapid = getVapidConfig();
		if (!vapid) return json({ enabled: false });
		return json({ enabled: true, publicKey: vapid.publicKey });
	} catch (error) {
		return handleApiError(error);
	}
};
