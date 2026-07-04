import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { logSupplement } from '$lib/server/supplements';
import { supplementLogSchema } from '$lib/server/validation';
import { todayInTimeZone } from '$lib/utils/dates';
import { getUserTimeZone } from '$lib/server/preferences';
import { validationError, parseJsonBody, withAuthedResource } from '$lib/server/errors';

export const POST: RequestHandler = withAuthedResource(async ({ userId, id, request }) => {
	const body = await parseJsonBody(request).catch(() => ({}));

	const parsed = supplementLogSchema.safeParse(body);
	if (!parsed.success) {
		return validationError(parsed.error);
	}

	const date = parsed.data.date ?? todayInTimeZone(await getUserTimeZone(userId));
	const result = await logSupplement(userId, id, date);

	if (!result.success) {
		if (result.error.message === 'Supplement not found') {
			return json({ error: 'Supplement not found' }, { status: 404 });
		}
		throw result.error;
	}

	return json({ log: result.data }, { status: 201 });
});
