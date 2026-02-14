import * as m from '$lib/paraglide/messages';

export const shiftDate = (isoDate: string, days: number) => {
	const date = new Date(isoDate + 'T00:00:00Z');
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
};

export const today = () => new Date().toISOString().slice(0, 10);

export const yesterday = () => shiftDate(today(), -1);

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

export const getDayOfWeek = (isoDate: string) => new Date(isoDate + 'T00:00:00Z').getUTCDay();

export const daysAgo = (days: number) => shiftDate(today(), -(days - 1));
