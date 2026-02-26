import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listSupplements, getLogsForDate } from '$lib/server/supplements';
import { isSupplementDue } from '$lib/utils/supplements';
import { handleApiError, requireAuth } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals, params }) => {
	try {
		const userId = requireAuth(locals);
		const date = params.date;
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
			return json({ error: 'Invalid date format' }, { status: 400 });
		}
		const dateObj = new Date(date + 'T00:00:00');

		const [allSupplements, logs] = await Promise.all([
			listSupplements(userId, true),
			getLogsForDate(userId, date)
		]);

		const logMap = new Map(logs.map((l) => [l.supplementId, l]));

		const checklist = allSupplements
			.filter((s) => isSupplementDue(s.scheduleType, s.scheduleDays, s.scheduleStartDate, dateObj))
			.map((s) => ({
				supplement: s,
				taken: logMap.has(s.id),
				takenAt: logMap.get(s.id)?.takenAt ?? null
			}));

		return json({ checklist, date });
	} catch (error) {
		return handleApiError(error);
	}
};
