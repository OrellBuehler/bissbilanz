export const INSIGHT_CARD_IDS = [
	'nova-score',
	'omega-ratio',
	'protein-distribution',
	'weekday-weekend',
	'calorie-front-loading',
	'dii-score',
	'tef',
	'calorie-cycling',
	'meal-regularity',
	'food-diversity',
	'eating-window',
	'meal-spacing',
	'nutrient-adequacy',
	'adaptive-tdee',
	'plateau-detection',
	'weight-forecast',
	'sodium-weight',
	'caloric-lag',
	'macro-impact',
	'meal-timing-weight',
	'micronutrient-gaps',
	'food-sleep',
	'nutrient-sleep',
	'pre-sleep-window',
	'caffeine-sleep'
] as const;

export type InsightCardId = (typeof INSIGHT_CARD_IDS)[number];

export const MAX_PINNED_INSIGHTS = 6;

export const isInsightCardId = (value: unknown): value is InsightCardId =>
	typeof value === 'string' && (INSIGHT_CARD_IDS as readonly string[]).includes(value);
