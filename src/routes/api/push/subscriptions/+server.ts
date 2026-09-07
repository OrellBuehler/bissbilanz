import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { handleApiError, parseJsonBody, requireAuth, validationError } from '$lib/server/errors';
import { pushSubscriptionSchema, pushSubscriptionDeleteSchema } from '$lib/server/validation';
import { deleteSubscription, saveSubscription } from '$lib/server/push/subscriptions';
import { isPushEnabled } from '$lib/server/push/config';

export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		const userId = requireAuth(locals);
		if (!isPushEnabled())
			return json({ error: 'Push notifications are not configured' }, { status: 404 });

		const parsed = pushSubscriptionSchema.safeParse(await parseJsonBody(request));
		if (!parsed.success) return validationError(parsed.error);

		await saveSubscription(userId, parsed.data, request.headers.get('user-agent'));
		return json({ subscribed: true }, { status: 201 });
	} catch (error) {
		return handleApiError(error);
	}
};

export const DELETE: RequestHandler = async ({ locals, request }) => {
	try {
		const userId = requireAuth(locals);
		const parsed = pushSubscriptionDeleteSchema.safeParse(await parseJsonBody(request));
		if (!parsed.success) return validationError(parsed.error);

		await deleteSubscription(userId, parsed.data.endpoint);
		return json({ subscribed: false });
	} catch (error) {
		return handleApiError(error);
	}
};
