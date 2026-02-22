import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listSupplements, getLogsForDate } from '$lib/server/supplements';
import { isSupplementDue } from '$lib/utils/supplements';
import { today } from '$lib/utils/dates';
import { handleApiError, requireAuth } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const userId = requireAuth(locals);
		const currentDate = today();
		const now = new Date();

		const [allSupplements, logs] = await Promise.all([
			listSupplements(userId, true),
			getLogsForDate(userId, currentDate)
		]);

		const logMap = new Map(logs.map((l) => [l.supplementId, l]));

		const checklist = allSupplements
			.filter((s) => isSupplementDue(s.scheduleType, s.scheduleDays, s.scheduleStartDate, now))
			.map((s) => ({
				supplement: s,
				taken: logMap.has(s.id),
				takenAt: logMap.get(s.id)?.takenAt ?? null
			}));

		return json({ checklist, date: currentDate });
	} catch (error) {
		return handleApiError(error);
	}
};
