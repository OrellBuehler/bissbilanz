import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listReminders, createReminder } from '$lib/server/reminders';
import { handleApiError, requireAuth, unwrapResult, parseJsonBody } from '$lib/server/errors';
import { readClientEditedAt } from '$lib/server/sync/headers';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const userId = requireAuth(locals);
		const reminders = await listReminders(userId);
		return json({ reminders });
	} catch (error) {
		return handleApiError(error);
	}
};

export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		const userId = requireAuth(locals);
		const body = await parseJsonBody(request);
		const reminder = unwrapResult(await createReminder(userId, body, readClientEditedAt(request)));
		return json({ reminder }, { status: 201 });
	} catch (error) {
		return handleApiError(error);
	}
};
