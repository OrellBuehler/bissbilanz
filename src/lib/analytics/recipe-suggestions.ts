/**
 * Ranks recipes by how well a scaled portion fills the remaining calorie/macro
 * budget of the day. Favorites get a small score bonus and win exact ties.
 * Mirrored 1:1 in Kotlin (`RecipeSuggestions.kt`) and locked by the golden
 * vectors in analytics-parity/.
 */

export type MacroBudget = {
	calories: number;
	protein: number;
	carbs: number;
	fat: number;
};

export type SuggestionMacros = MacroBudget & { fiber: number };

export type SuggestionCandidate = {
	id: string;
	name: string;
	perServing: SuggestionMacros;
	isFavorite: boolean;
};

export type RecipeSuggestion = {
	id: string;
	servings: number;
	macros: SuggestionMacros;
	score: number;
	fit: number;
};

export const MIN_REMAINING_CALORIES = 100;
export const DEFAULT_SUGGESTION_LIMIT = 10;

// Closest to one serving first, so equal scores keep the more natural portion.
const SERVING_STEPS = [1, 0.75, 1.25, 0.5, 1.5, 1.75, 2];
const MAX_CALORIE_OVERSHOOT = 0.3;
const CALORIE_OVERSHOOT_WEIGHT = 1.5;
const PROTEIN_UNDERSHOOT_WEIGHT = 1.5;
const PROTEIN_FLOOR = 15;
const CARBS_FLOOR = 15;
const FAT_FLOOR = 10;
const WEIGHT_CALORIES = 0.5;
const WEIGHT_PROTEIN = 0.25;
const WEIGHT_CARBS = 0.125;
const WEIGHT_FAT = 0.125;
const PORTION_PENALTY = 0.02;
const FAVORITE_BONUS = 0.95;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const macroError = (amount: number, remaining: number, floor: number) => {
	const target = Math.max(remaining, 0);
	return clamp((amount - target) / Math.max(target, floor), -1, 2);
};

const scoreServing = (
	perServing: SuggestionMacros,
	servings: number,
	remaining: MacroBudget
): number => {
	const calErr = (perServing.calories * servings - remaining.calories) / remaining.calories;
	const calPenalty = calErr > 0 ? CALORIE_OVERSHOOT_WEIGHT * calErr * calErr : calErr * calErr;

	const proteinErr = macroError(perServing.protein * servings, remaining.protein, PROTEIN_FLOOR);
	const proteinPenalty =
		proteinErr < 0 ? PROTEIN_UNDERSHOOT_WEIGHT * proteinErr * proteinErr : proteinErr * proteinErr;
	const carbsErr = macroError(perServing.carbs * servings, remaining.carbs, CARBS_FLOOR);
	const fatErr = macroError(perServing.fat * servings, remaining.fat, FAT_FLOOR);

	return (
		WEIGHT_CALORIES * calPenalty +
		WEIGHT_PROTEIN * proteinPenalty +
		WEIGHT_CARBS * carbsErr * carbsErr +
		WEIGHT_FAT * fatErr * fatErr +
		PORTION_PENALTY * Math.abs(servings - 1)
	);
};

const compareStrings = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function suggestRecipes(
	remaining: MacroBudget,
	candidates: SuggestionCandidate[],
	limit: number = DEFAULT_SUGGESTION_LIMIT
): RecipeSuggestion[] {
	if (remaining.calories < MIN_REMAINING_CALORIES) return [];

	const ranked: (RecipeSuggestion & { name: string; isFavorite: boolean })[] = [];
	for (const candidate of candidates) {
		const perServing = candidate.perServing;
		if (!(perServing.calories > 0)) continue;

		let bestServings = SERVING_STEPS[0];
		let bestScore = Infinity;
		for (const servings of SERVING_STEPS) {
			const score = scoreServing(perServing, servings, remaining);
			if (score < bestScore) {
				bestScore = score;
				bestServings = servings;
			}
		}

		const calories = perServing.calories * bestServings;
		if (calories > remaining.calories * (1 + MAX_CALORIE_OVERSHOOT)) continue;

		const score = candidate.isFavorite ? bestScore * FAVORITE_BONUS : bestScore;
		ranked.push({
			id: candidate.id,
			name: candidate.name,
			isFavorite: candidate.isFavorite,
			servings: bestServings,
			macros: {
				calories,
				protein: perServing.protein * bestServings,
				carbs: perServing.carbs * bestServings,
				fat: perServing.fat * bestServings,
				fiber: perServing.fiber * bestServings
			},
			score,
			fit: Math.floor(100 * Math.max(0, 1 - Math.sqrt(score)) + 0.5)
		});
	}

	ranked.sort(
		(a, b) =>
			a.score - b.score ||
			Number(b.isFavorite) - Number(a.isFavorite) ||
			compareStrings(a.name, b.name) ||
			compareStrings(a.id, b.id)
	);
	return ranked
		.slice(0, Math.max(0, limit))
		.map(({ name: _name, isFavorite: _isFavorite, ...suggestion }) => suggestion);
}

/** Recipe list/detail APIs return whole-recipe totals; suggestions work per serving. */
export function perServingMacros(recipe: {
	totalServings: number;
	calories: number;
	protein: number;
	carbs: number;
	fat: number;
	fiber: number;
}): SuggestionMacros {
	const divisor = recipe.totalServings > 0 ? recipe.totalServings : 1;
	return {
		calories: recipe.calories / divisor,
		protein: recipe.protein / divisor,
		carbs: recipe.carbs / divisor,
		fat: recipe.fat / divisor,
		fiber: recipe.fiber / divisor
	};
}
