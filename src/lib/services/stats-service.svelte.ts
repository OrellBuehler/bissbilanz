import * as Sentry from '@sentry/sveltekit';
import { browser } from '$app/environment';
import { api } from '$lib/api/client';

function reportIfOnline(err: unknown, context: string): void {
	if (!(browser && !navigator.onLine)) {
		Sentry.captureException(err, { extra: { context } });
	}
}

async function getStreaks() {
	try {
		const { data } = await api.GET('/api/stats/streaks');
		return data ?? null;
	} catch (err) {
		reportIfOnline(err, 'stats-service.getStreaks');
		return null;
	}
}

async function getMealBreakdown(query?: { date?: string; startDate?: string; endDate?: string }) {
	try {
		const { data } = await api.GET('/api/stats/meal-breakdown', {
			params: { query }
		});
		return data ?? null;
	} catch (err) {
		reportIfOnline(err, 'stats-service.getMealBreakdown');
		return null;
	}
}

async function getTopFoods(
	days?: number,
	limit?: number,
	sort?: 'count' | 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber'
) {
	try {
		const { data } = await api.GET('/api/stats/top-foods', {
			params: { query: { days, limit, sort } }
		});
		return data ?? null;
	} catch (err) {
		reportIfOnline(err, 'stats-service.getTopFoods');
		return null;
	}
}

async function getWeeklyStats() {
	try {
		const { data } = await api.GET('/api/stats/weekly');
		return data ?? null;
	} catch (err) {
		reportIfOnline(err, 'stats-service.getWeeklyStats');
		return null;
	}
}

async function getMonthlyStats() {
	try {
		const { data } = await api.GET('/api/stats/monthly');
		return data ?? null;
	} catch (err) {
		reportIfOnline(err, 'stats-service.getMonthlyStats');
		return null;
	}
}

async function getDailyStatus(startDate: string, endDate: string) {
	try {
		const { data } = await api.GET('/api/stats/daily', {
			params: { query: { startDate, endDate } }
		});
		return data ?? null;
	} catch (err) {
		reportIfOnline(err, 'stats-service.getDailyStatus');
		return null;
	}
}

async function getCalendarStats(month: string) {
	try {
		const { data } = await api.GET('/api/stats/calendar', {
			params: { query: { month } }
		});
		return data ?? null;
	} catch (err) {
		reportIfOnline(err, 'stats-service.getCalendarStats');
		return null;
	}
}

export const statsService = {
	getStreaks,
	getMealBreakdown,
	getTopFoods,
	getWeeklyStats,
	getMonthlyStats,
	getDailyStatus,
	getCalendarStats
};
