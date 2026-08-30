/** `isoDate` shifted by `days` calendar days (pure UTC string math; no runtime timezone). */
export function shiftDate(isoDate: string, days: number): string {
	const date = new Date(isoDate + 'T00:00:00Z');
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}
