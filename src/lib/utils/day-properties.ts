export type DayPropertiesPatch = {
	isFastingDay?: boolean;
	notes?: string | null;
	waterMl?: number | null;
	activityCalories?: number | null;
	activityNote?: string | null;
};

export type DayPropertiesValues = {
	date: string;
	isFastingDay: boolean;
	notes?: string | null;
	waterMl?: number | null;
	activityCalories?: number | null;
	activityNote?: string | null;
};

export const DEFAULT_WATER_GOAL_ML = 2000;
export const MAX_WATER_ML = 20000;
export const MAX_ACTIVITY_CALORIES = 20000;

/**
 * True when a day carries no user data any more, so the row can be dropped
 * instead of persisting an all-defaults record.
 */
export function isDayPropertiesEmpty(props: DayPropertiesPatch | null | undefined): boolean {
	if (!props) return true;
	return (
		!props.isFastingDay &&
		!props.notes?.trim() &&
		(props.waterMl ?? 0) <= 0 &&
		(props.activityCalories ?? 0) <= 0 &&
		!props.activityNote?.trim()
	);
}

/** Applies a PATCH-style change: omitted stays unchanged, null clears. */
export function applyDayPropertiesPatch(
	current: DayPropertiesValues | null,
	date: string,
	patch: DayPropertiesPatch
): DayPropertiesValues {
	const base = current ?? { date, isFastingDay: false };
	return {
		date,
		isFastingDay: patch.isFastingDay ?? base.isFastingDay ?? false,
		notes: patch.notes !== undefined ? patch.notes : (base.notes ?? null),
		waterMl: patch.waterMl !== undefined ? patch.waterMl : (base.waterMl ?? null),
		activityCalories:
			patch.activityCalories !== undefined
				? patch.activityCalories
				: (base.activityCalories ?? null),
		activityNote:
			patch.activityNote !== undefined ? patch.activityNote : (base.activityNote ?? null)
	};
}

/** Clamps a water amount into the storable range; null when nothing is left. */
export function clampWaterMl(ml: number | null | undefined): number | null {
	if (ml == null || !Number.isFinite(ml)) return null;
	const rounded = Math.round(ml);
	if (rounded <= 0) return null;
	return Math.min(rounded, MAX_WATER_ML);
}

export function clampActivityCalories(kcal: number | null | undefined): number | null {
	if (kcal == null || !Number.isFinite(kcal)) return null;
	const rounded = Math.round(kcal);
	if (rounded <= 0) return null;
	return Math.min(rounded, MAX_ACTIVITY_CALORIES);
}

/** Progress toward the water goal, capped at 100 for the progress bar. */
export function waterProgressPercent(ml: number | null | undefined, goalMl: number): number {
	const goal = goalMl > 0 ? goalMl : DEFAULT_WATER_GOAL_ML;
	const value = ml ?? 0;
	if (value <= 0) return 0;
	return Math.min(100, Math.round((value / goal) * 100));
}
