export type WeightFoodPoint = {
	date: string;
	calories: number | null;
	weightKg: number | null;
	movingAvg: number | null;
};

export type MealEntry = {
	date: string;
	mealType: string;
	eatenAt: string | null;
	calories: number;
	foodName: string;
};

export type DailyNutrient = {
	date: string;
	calories: number;
	protein: number;
	carbs: number;
	fat: number;
	fiber: number;
	[key: string]: number | string;
};
