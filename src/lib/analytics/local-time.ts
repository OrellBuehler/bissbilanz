/**
 * Minutes since local midnight (0..1439) for the UTC instant `iso`, rendered in
 * the given IANA `timeZone`. Returns null if the timestamp can't be parsed.
 *
 * Deterministic: the result depends only on the explicit `timeZone`, never on the
 * host's runtime timezone — so callers (web components, on-device analytics) pass
 * the device timezone in production while tests pass a fixed zone. Format-agnostic:
 * works for both `...Z` and offset-bearing ISO strings since it operates on the
 * absolute instant. Mirrors the KMP `localMinutesOfDay` so both platforms agree.
 */
/** The device's IANA timezone, for bucketing on-device analytics in local time. */
export function deviceTimeZone(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function localMinutesOfDay(iso: string, timeZone: string): number | null {
	const ms = Date.parse(iso);
	if (Number.isNaN(ms)) return null;
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23'
	}).formatToParts(new Date(ms));
	const hour = Number(parts.find((p) => p.type === 'hour')?.value);
	const minute = Number(parts.find((p) => p.type === 'minute')?.value);
	if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
	return (hour % 24) * 60 + minute;
}
