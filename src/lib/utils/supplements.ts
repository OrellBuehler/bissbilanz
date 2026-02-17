import type { ScheduleType } from '$lib/supplement-units';

/**
 * Determine if a supplement is due on a given date.
 */
export function isSupplementDue(
	scheduleType: ScheduleType,
	scheduleDays: number[] | null,
	scheduleStartDate: string | null,
	date: Date
): boolean {
	switch (scheduleType) {
		case 'daily':
			return true;

		case 'every_other_day': {
			if (!scheduleStartDate) return true;
			const start = new Date(scheduleStartDate);
			const diffMs = date.getTime() - start.getTime();
			const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
			return diffDays % 2 === 0;
		}

		case 'weekly':
		case 'specific_days':
			if (!scheduleDays || scheduleDays.length === 0) return false;
			return scheduleDays.includes(date.getDay());

		default:
			return false;
	}
}

/**
 * Format a schedule into a human-readable summary.
 */
export function formatSchedule(
	scheduleType: ScheduleType,
	scheduleDays: number[] | null
): string {
	const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

	switch (scheduleType) {
		case 'daily':
			return 'Daily';
		case 'every_other_day':
			return 'Every other day';
		case 'weekly':
		case 'specific_days':
			if (!scheduleDays || scheduleDays.length === 0) return 'No days set';
			return scheduleDays.map((d) => dayNames[d]).join(', ');
		default:
			return 'Unknown';
	}
}
