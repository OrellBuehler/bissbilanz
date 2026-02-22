export const DEFAULT_MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'] as const;
export type DefaultMealType = (typeof DEFAULT_MEAL_TYPES)[number];

export const mergeMealTypes = (defaults: string[], custom: string[]) => {
	return [...defaults, ...custom];
};

export type FavoriteMealTimeframeInput = {
	mealType: string;
	startTime: string;
	endTime: string;
};

export type FavoriteMealTimeframe = {
	mealType: string;
	startMinute: number;
	endMinute: number;
};

type FavoriteMealTimeframeValidationResult =
	| { valid: true; normalized: FavoriteMealTimeframe[] }
	| { valid: false; error: 'invalid-time' | 'invalid-range' | 'overlap' | 'missing-meal-type' };

export const parseTimeToMinutes = (value: string): number | null => {
	if (!/^\d{2}:\d{2}$/.test(value)) return null;

	const [hourText, minuteText] = value.split(':');
	const hour = Number(hourText);
	const minute = Number(minuteText);
	if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
	if (hour < 0 || hour > 23) return null;
	if (minute < 0 || minute > 59) return null;

	return hour * 60 + minute;
};

export const resolveMealTypeForMinute = (
	minuteOfDay: number,
	timeframes: FavoriteMealTimeframe[]
): string | null => {
	for (const timeframe of timeframes) {
		if (minuteOfDay >= timeframe.startMinute && minuteOfDay < timeframe.endMinute) {
			return timeframe.mealType;
		}
	}
	return null;
};

export const validateFavoriteMealTimeframes = (
	inputs: FavoriteMealTimeframeInput[]
): FavoriteMealTimeframeValidationResult => {
	const normalized: FavoriteMealTimeframe[] = [];

	for (const input of inputs) {
		const mealType = input.mealType.trim();
		if (!mealType) {
			return { valid: false, error: 'missing-meal-type' };
		}

		const startMinute = parseTimeToMinutes(input.startTime);
		const endMinute = parseTimeToMinutes(input.endTime);
		if (startMinute === null || endMinute === null) {
			return { valid: false, error: 'invalid-time' };
		}

		// Cross-midnight and zero-length windows are not supported in v1.
		if (startMinute >= endMinute) {
			return { valid: false, error: 'invalid-range' };
		}

		normalized.push({ mealType, startMinute, endMinute });
	}

	const sorted = [...normalized].sort((a, b) => a.startMinute - b.startMinute);
	for (let i = 1; i < sorted.length; i++) {
		const prev = sorted[i - 1];
		const current = sorted[i];
		if (prev && current && current.startMinute < prev.endMinute) {
			return { valid: false, error: 'overlap' };
		}
	}

	return { valid: true, normalized: sorted };
};

export const getCurrentMealByTime = (): string => {
	const hour = new Date().getHours();
	if (hour < 11) return 'Breakfast';
	if (hour < 15) return 'Lunch';
	if (hour < 18) return 'Snacks';
	return 'Dinner';
};
