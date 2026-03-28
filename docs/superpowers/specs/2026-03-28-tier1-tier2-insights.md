# Tier 1 + Tier 2 Insights — Design Spec

## Overview

15 new analytics insights for the Insights page, organized across 3 tabs.

## Tab Mapping

| Insight                 | Tab       | Border Color |
| ----------------------- | --------- | ------------ |
| Adaptive TDEE           | Weight    | blue-500     |
| Plateau Detection       | Weight    | amber-500    |
| Weight Forecast         | Weight    | emerald-500  |
| Sodium-Weight Explainer | Weight    | yellow-500   |
| NOVA Processing Score   | Nutrition | orange-500   |
| Omega-6/3 Ratio         | Nutrition | green-500    |
| Protein Distribution    | Nutrition | red-500      |
| Weekend vs Weekday      | Nutrition | purple-500   |
| Calorie Front-Loading   | Nutrition | orange-400   |
| DII Score               | Nutrition | rose-500     |
| TEF Estimator           | Nutrition | indigo-500   |
| Dietary Diversity       | Nutrition | teal-500     |
| Meal Regularity         | Nutrition | violet-500   |
| Calorie Cycling         | Nutrition | cyan-500     |
| Caffeine-Sleep Cutoff   | Sleep     | amber-600    |

## API Strategy

- Extend `getDailyNutrientTotals` with extended nutrient columns
- New: `getExtendedNutrientEntries()` — per-entry rows with all nutrients
- New: `getFoodDiversityData()` — distinct foods per day
- New: `/api/analytics/nutrients-extended` endpoint
- New: `/api/analytics/food-diversity` endpoint

## Grouped Fetch

- `WeightInsightsGroup.svelte` — fetches weight-food (90d), passes to TDEE/Plateau/Forecast cards
- `NutritionInsightsGroup.svelte` — fetches nutrients-extended + meal-timing (90d), passes to 9 cards
- `SodiumWeightCard` — needs nutrients-extended (fetched independently on weight tab)
- `CaffeineSleepCard` — needs nutrients-extended + sleep-food
- `FoodDiversityCard` — needs food-diversity

## Key Algorithms

### Adaptive TDEE

Rolling 14-day window: TDEE = avg*intake - (slope(weight) * 7 \_ 7700 / 7). Clamp 1200-5000 kcal.

### Plateau Detection

14-day weight slope < 0.05 kg/week AND TDEE - avg_intake > 150 kcal/day.

### DII Coefficients

fiber=-0.663, omega3=-0.436, vitC=-0.299, vitD=-0.446, vitE=-0.419, satFat=+0.373, transFat=+0.229, alcohol=+0.407, caffeine=-0.110, sodium=+0.269

### TEF

TEF = (protein*kcal * 0.25) + (carb*kcal * 0.08) + (fat_kcal \* 0.03)

## Build Phases

1. Server layer (analytics.ts + 2 new API routes)
2. Computation modules (9 files + tests)
3. Weight tab cards (4 cards + group wrapper)
4. Nutrition tab cards (10 cards + group wrapper)
5. Sleep tab (CaffeineSleepCard)
6. i18n + polish
