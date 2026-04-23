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
			const [sy, sm, sd] = scheduleStartDate.split('-').map(Number);
			const startDays = Math.floor(new Date(sy, sm - 1, sd).getTime() / 86400000);
			const dateDays = Math.floor(
				new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 86400000
			);
			return (dateDays - startDays) % 2 === 0;
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
 * Parse "<number> <unit>" (e.g. "42 mg") out of an ingredient's `ingredientsText`.
 * Returns `parsed: true` only when the entire text matches that pattern so the
 * caller can preserve richer free-form labels (e.g. "5000 IU, sunflower oil")
 * verbatim for round-trip safety.
 */
export function parseDosage(text: string | null | undefined): {
	dosage: number;
	unit: string;
	parsed: boolean;
} {
	if (!text) return { dosage: 0, unit: 'mg', parsed: false };
	const match = text.match(/^\s*([\d.]+)\s*(\S+)\s*$/);
	if (!match) return { dosage: 0, unit: 'mg', parsed: false };
	const n = parseFloat(match[1]);
	if (isNaN(n)) return { dosage: 0, unit: 'mg', parsed: false };
	return { dosage: n, unit: match[2], parsed: true };
}

/**
 * Format a schedule into a human-readable summary.
 */
export function formatSchedule(scheduleType: ScheduleType, scheduleDays: number[] | null): string {
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
