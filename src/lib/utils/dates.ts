import * as m from '$lib/paraglide/messages';

export const shiftDate = (isoDate: string, days: number) => {
	const date = new Date(isoDate + 'T00:00:00Z');
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
};

export const today = () => new Date().toISOString().slice(0, 10);

export const yesterday = () => shiftDate(today(), -1);

export const tomorrow = () => shiftDate(today(), 1);

export const formatDateLabel = (isoDate: string): string => {
	const t = today();
	if (isoDate === t) return m.dashboard_today();
	if (isoDate === shiftDate(t, -1)) return m.dashboard_yesterday();
	if (isoDate === shiftDate(t, 1)) return m.dashboard_tomorrow();
	const [year, month, day] = isoDate.split('-').map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	return date.toLocaleDateString(undefined, {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	});
};

export const isValidIsoDate = (s: string): boolean => {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
	const d = new Date(s + 'T00:00:00Z');
	return d.toISOString().startsWith(s);
};

export const getMonthDays = (year: number, month: number) => {
	const firstDay = new Date(year, month, 1);
	const lastDay = new Date(year, month + 1, 0);
	const days: string[] = [];
	for (let d = 1; d <= lastDay.getDate(); d++) {
		days.push(new Date(year, month, d).toISOString().slice(0, 10));
	}
	return { firstDay, lastDay, days };
};

export const getMonthName = (month: number) =>
	[
		m.month_january,
		m.month_february,
		m.month_march,
		m.month_april,
		m.month_may,
		m.month_june,
		m.month_july,
		m.month_august,
		m.month_september,
		m.month_october,
		m.month_november,
		m.month_december
	][month]();

export const daysBetween = (startDate: string, endDate: string): number => {
	const start = new Date(startDate + 'T00:00:00Z');
	const end = new Date(endDate + 'T00:00:00Z');
	return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
};

export const getDayOfWeek = (isoDate: string) => new Date(isoDate + 'T00:00:00Z').getUTCDay();

export const daysAgo = (days: number) => shiftDate(today(), -(days - 1));
