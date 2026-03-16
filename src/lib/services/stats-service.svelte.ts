import { api } from '$lib/api/client';

async function getStreaks() {
	try {
		const { data } = await api.GET('/api/stats/streaks');
		return data ?? null;
	} catch {
		return null;
	}
}

async function getMealBreakdown(query?: { date?: string; startDate?: string; endDate?: string }) {
	try {
		const { data } = await api.GET('/api/stats/meal-breakdown', {
			params: { query }
		});
		return data ?? null;
	} catch {
		return null;
	}
}

async function getTopFoods(days?: number, limit?: number) {
	try {
		const { data } = await api.GET('/api/stats/top-foods', {
			params: { query: { days, limit } }
		});
		return data ?? null;
	} catch {
		return null;
	}
}

async function getWeeklyStats() {
	try {
		const { data } = await api.GET('/api/stats/weekly');
		return data ?? null;
	} catch {
		return null;
	}
}

async function getMonthlyStats() {
	try {
		const { data } = await api.GET('/api/stats/monthly');
		return data ?? null;
	} catch {
		return null;
	}
}

async function getDailyStatus(startDate: string, endDate: string) {
	try {
		const { data } = await api.GET('/api/stats/daily', {
			params: { query: { startDate, endDate } }
		});
		return data ?? null;
	} catch {
		return null;
	}
}

async function getCalendarStats(month: string) {
	try {
		const { data } = await api.GET('/api/stats/calendar', {
			params: { query: { month } }
		});
		return data ?? null;
	} catch {
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
