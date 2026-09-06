import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { handleApiError, requireAuth } from '$lib/server/errors';
import { isPushEnabled } from '$lib/server/push/config';
import { sendTestNotification } from '$lib/server/push/dispatch';

export const POST: RequestHandler = async ({ locals }) => {
	try {
		const userId = requireAuth(locals);
		if (!isPushEnabled())
			return json({ error: 'Push notifications are not configured' }, { status: 404 });

		const delivered = await sendTestNotification(userId);
		if (delivered === 0) {
			return json({ error: 'No active push subscriptions' }, { status: 404 });
		}
		return json({ delivered });
	} catch (error) {
		return handleApiError(error);
	}
};
