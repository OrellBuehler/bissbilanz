import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getReminderById, updateReminder, deleteReminder } from '$lib/server/reminders';
import { notFound, unwrapResult, parseJsonBody, withAuthedResource } from '$lib/server/errors';
import { isStaleDelete, respondUpdate, staleConflict } from '$lib/server/sync/conflict';
import { reminders } from '$lib/server/schema';

export const GET: RequestHandler = withAuthedResource(async ({ userId, id }) => {
	const reminder = await getReminderById(userId, id);
	if (!reminder) {
		return notFound('Reminder');
	}
	return json({ reminder });
});

export const PATCH: RequestHandler = withAuthedResource(
	async ({ userId, id, request, clientEditedAt }) => {
		const body = await parseJsonBody(request);
		const reminder = unwrapResult(await updateReminder(userId, id, body, clientEditedAt));
		return respondUpdate({
			key: 'reminder',
			updated: reminder,
			clientEditedAt,
			resourceName: 'Reminder'
		});
	}
);

export const DELETE: RequestHandler = withAuthedResource(async ({ userId, id, clientEditedAt }) => {
	if (await isStaleDelete(reminders, id, userId, clientEditedAt)) {
		return staleConflict();
	}
	await deleteReminder(userId, id);
	return new Response(null, { status: 204 });
});
