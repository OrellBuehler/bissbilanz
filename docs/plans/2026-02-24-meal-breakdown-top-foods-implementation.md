# Implementation Plan: Per-Meal Breakdown & Top Foods

Two parallel feature branches from `main`, each with its own PR.

## Shared Infrastructure (both agents create independently — resolve conflicts on second merge)

### i18n Keys (messages/en.json + messages/de.json)
```
nav_insights: "Insights" / "Einblicke"
insights_title: "Insights" / "Einblicke"
insights_meal_distribution: "Meal Distribution" / "Mahlzeitenverteilung"
insights_top_foods: "Top Foods" / "Top-Lebensmittel"
insights_times_logged: "{count} times" / "{count} mal"
insights_per_serving: "per serving" / "pro Portion"
insights_see_more: "See more" / "Mehr anzeigen"
insights_today: "Today" / "Heute"
insights_7d: "7 days" / "7 Tage"
insights_30d: "30 days" / "30 Tage"
insights_no_data: "No data for this period" / "Keine Daten für diesen Zeitraum"
settings_widget_meal_breakdown: "Meal Breakdown" / "Mahlzeiten-Aufschlüsselung"
settings_widget_meal_breakdown_desc: "Calorie distribution across meals" / "Kalorienverteilung über Mahlzeiten"
settings_widget_top_foods: "Top Foods" / "Top-Lebensmittel"
settings_widget_top_foods_desc: "Most frequently logged foods" / "Am häufigsten protokollierte Lebensmittel"
```

### Navigation (`src/lib/config/navigation.ts`)
- Add `insights` entry with `ChartBar` icon, pink badge color
- Position between Weight and Goals

### Insights Page (`src/routes/(app)/insights/+page.svelte`)
- Scrollable page with sections
- Each section has time range selector

### Settings Integration
- Add `showMealBreakdownWidget` and `showTopFoodsWidget` to preferences
- Add `meal-breakdown` and `top-foods` to `ALL_SECTION_KEYS` and `WIDGET_DEFS`
- Add switch toggles in settings page widget list

---

## Feature A: Per-Meal Breakdown (branch: `feat/meal-breakdown`)

### 1. API Endpoint: `GET /api/stats/meal-breakdown`
**File:** `src/routes/api/stats/meal-breakdown/+server.ts`
- Query params: `date` (single day, default today) OR `startDate` + `endDate` (range)
- Auth: `requireAuth(locals)`
- Logic: Call `getMealBreakdown(userId, startDate, endDate)`
- Response: `{ data: [{ mealType, calories, protein, carbs, fat, fiber }] }`

### 2. Server Function: `getMealBreakdown`
**File:** `src/lib/server/stats.ts` (add to existing)
- Use `listEntriesByDateRange` to get entries
- Group by `mealType`
- Sum macros per group using `calculateEntryMacros` + `addTotals`
- Return sorted array (breakfast, lunch, dinner, snacks, then custom)

### 3. Dashboard Widget: `MealBreakdownWidget.svelte`
**File:** `src/lib/components/dashboard/MealBreakdownWidget.svelte`
- Props: `date: string`
- Fetches `/api/stats/meal-breakdown?date={date}`
- Mini donut chart (PieChart from layerchart, innerRadius=0.6)
- Center: total calories
- Colors: breakfast=#F59E0B (amber), lunch=#3B82F6 (blue), dinner=#8B5CF6 (violet), snacks=#10B981 (emerald), custom=#6B7280 (gray)
- "See more" link to `/insights`
- Uses DashboardCard with tone="rose", ChartPie icon

### 4. Dashboard Integration
**File:** `src/routes/(app)/+page.svelte`
- Import MealBreakdownWidget
- Add `meal-breakdown` case in widget render loop
- Gate on `userPrefs?.showMealBreakdownWidget`
- Pass `activeDate`

### 5. Settings Integration
- Add `showMealBreakdownWidget` state variable
- Add to WIDGET_DEFS
- Add Switch toggle
- Add to default widget order
- Update `ALL_SECTION_KEYS` in `src/lib/server/preferences.ts`

### 6. Insights Page — Meal Distribution Section
- Larger donut chart + table below
- Time range: today / 7d / 30d toggle (Button group)
- Table columns: meal type, calories, protein, carbs, fat, fiber, % of total

---

## Feature B: Top Foods (branch: `feat/top-foods`)

### 1. API Endpoint: `GET /api/stats/top-foods`
**File:** `src/routes/api/stats/top-foods/+server.ts`
- Query params: `days=7` (default) or `days=30`, `limit=10` (default)
- Auth: `requireAuth(locals)`
- Logic: Call `getTopFoods(userId, days, limit)`
- Response: `{ data: [{ foodId, foodName, count, calories, protein, carbs, fat, fiber }] }`

### 2. Server Function: `getTopFoods`
**File:** `src/lib/server/stats.ts` (add to existing)
- Query `foodEntries` joined with `foods` and `recipes`
- Filter by date range (last N days)
- GROUP BY foodId/recipeId
- COUNT(*) as frequency
- AVG macros per serving
- ORDER BY count DESC, LIMIT
- Return array with food name, count, and average macros

### 3. Dashboard Widget: `TopFoodsWidget.svelte`
**File:** `src/lib/components/dashboard/TopFoodsWidget.svelte`
- Props: none (always fetches last 7 days)
- Fetches `/api/stats/top-foods?days=7&limit=3`
- Ranked list: position number (1-3), food name, times logged badge, calories
- "See more" link to `/insights`
- Uses DashboardCard with tone="emerald", TrendingUp icon

### 4. Dashboard Integration
**File:** `src/routes/(app)/+page.svelte`
- Import TopFoodsWidget
- Add `top-foods` case in widget render loop
- Gate on `userPrefs?.showTopFoodsWidget`

### 5. Settings Integration
- Same pattern as meal-breakdown: add state, WIDGET_DEFS entry, Switch toggle
- Add to default widget order
- Update `ALL_SECTION_KEYS` in `src/lib/server/preferences.ts`

### 6. Insights Page — Top Foods Section
- Top 10 list with time range toggle (7d / 30d)
- Each row: rank, food name, times logged, calories per serving, protein, carbs, fat, fiber
- Horizontal macro bars (tiny inline bars showing relative proportions)
