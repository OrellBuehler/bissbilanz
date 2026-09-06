/**
 * Wall-clock 'HH:MM' on a given day, resolved in the user's IANA zone. The
 * server runs in UTC, so a naive `new Date('2026-01-01T22:45')` would shift
 * every imported bedtime by the user's offset.
 */
export function zonedTimeToInstant(isoDate: string, time: string, timeZone: string): string | null {
	const [hours, minutes] = time.split(':').map(Number);
	const [year, month, day] = isoDate.split('-').map(Number);
	if ([hours, minutes, year, month, day].some((value) => !Number.isFinite(value))) return null;

	const asUtc = Date.UTC(year, month - 1, day, hours, minutes);
	const offsetAt = (ms: number) => {
		const parts = new Intl.DateTimeFormat('en-US', {
			timeZone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hourCycle: 'h23'
		}).formatToParts(new Date(ms));
		const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
		return (
			Date.UTC(
				get('year'),
				get('month') - 1,
				get('day'),
				get('hour'),
				get('minute'),
				get('second')
			) - ms
		);
	};

	let timestamp = asUtc - offsetAt(asUtc);
	const corrected = asUtc - offsetAt(timestamp);
	if (corrected !== timestamp) timestamp = corrected;
	const date = new Date(timestamp);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
