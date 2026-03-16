# Insights Page Overhaul

## Overview

Comprehensive overhaul of the insights page adding trends, goal adherence, calendar heatmap, and macro balance radar chart. Existing sections (meal distribution, top foods) are retained and moved below the new sections. All section cards become collapsible. Implementation covers both PWA (SvelteKit) and Android (Jetpack Compose).

## Approach

API-first: verify/extend backend endpoints, then implement PWA frontend, then Android frontend. Most data is already available via existing endpoints.

## Sections (in page order)

### 1. Collapsible Cards

All insight sections are wrapped in a collapsible card component.

- Header tap toggles expand/collapse with chevron icon rotation
- Collapse state persisted in localStorage (PWA) / SharedPreferences (Android)
- Storage key format: `insights.{sectionId}.collapsed` (boolean), default: all expanded
- Section IDs: `trends`, `adherence`, `calendar`, `radar`, `meals`, `topfoods`
- **PWA:** New `CollapsibleCard` component using shadcn `Card` + `Collapsible` primitives
- **Android:** `CollapsibleCard` composable using `AnimatedVisibility`

### 2. Trends Over Time

Bar chart showing daily values over a selectable range.

- **Range toggle:** 7d / 30d / 90d (in card header)
- **Metric toggle:** Calories, Protein, Carbs, Fat, Fiber (one at a time)
- Bar chart for daily values
- Horizontal dashed goal line overlay (if goal is set)
- **Data source:** Existing `getDailyBreakdown` endpoint (returns day-by-day macro totals + goals)
- **New backend work:** None
- **PWA:** LayerChart bar chart with reference line
- **Android:** Vico chart library or custom Canvas composable

### 3. Goal Adherence

Summary card showing target hit rates over a period.

- **Range toggle:** 7d / 30d / 90d (independent from trends section)
- For each macro (calories, protein, carbs, fat, fiber):
  - "X of Y days on target" (strict: met or exceeded goal)
  - "X of Y days within range" (±10% tolerance)
  - Progress bar visualization
- Overall adherence score at top: percentage of days where all goals met (both strict and tolerant variants)
- **Data source:** `getDailyBreakdown` endpoint, compare against goals client-side
- **New backend work:** None
- **PWA:** Grid of stat blocks with progress bars
- **Android:** Grid layout with `LinearProgressIndicator`

### 4. Calendar Heatmap

Monthly calendar grid with days color-coded by calorie adherence.

- Month navigation arrows (prev/next)
- Day cell colors:
  - **Green:** within ±10% of calorie goal
  - **Red:** over goal (intensity scales with distance)
  - **Blue:** under goal (intensity scales with distance)
  - **Gray/empty:** no entries logged
- Legend below the calendar
- Tap a day to navigate to that day's log (nice-to-have)
- **Data source:** Existing `getCalendarStats` endpoint + goals from goals service
- **New backend work:** None
- **PWA:** CSS grid (7 columns, Mon-Sun), color computed from calorie/goal ratio
- **Android:** `LazyVerticalGrid` with 7 columns, same color logic

### 5. Macro Balance Radar

Radar/spider chart comparing actual macro averages vs goals.

- **Range toggle:** 7d / 30d / 90d (in card header)
- Radar chart with 5 axes: Calories, Protein, Carbs, Fat, Fiber
- Two overlapping shapes:
  - **Filled/semi-transparent:** actual averages for the period
  - **Outline/dashed:** goal values
- Each axis normalized to percentage of goal (100% = on target)
- Numeric legend below chart showing actual vs goal values
- **Data source:** `getDailyBreakdown` for actuals (averaged client-side), goals from goals service
- **New backend work:** None
- **PWA:** Custom SVG radar chart component (LayerChart does not have a radar chart primitive)
- **Android:** Custom Canvas composable drawing radar polygon

### 6. Meal Distribution (existing)

Unchanged functionality. Moved below new sections. Wrapped in `CollapsibleCard`.

### 7. Top Foods (existing)

Unchanged functionality. Moved below new sections. Wrapped in `CollapsibleCard`.

## API Surface

No new backend endpoints required. All new sections use existing APIs:

| Endpoint | Used by |
|---|---|
| `GET /api/stats/daily?startDate&endDate` | Trends, Goal Adherence, Macro Balance Radar (includes goals in response) |
| `GET /api/stats/calendar?month=YYYY-MM` | Calendar Heatmap |
| `GET /api/stats/meal-breakdown` | Meal Distribution (existing) |
| `GET /api/stats/top-foods` | Top Foods (existing) |
| `GET /api/goals` | Calendar Heatmap only (daily endpoint already bundles goals for the other sections) |

### Frontend service gaps

- `stats-service.svelte.ts` is missing a `getCalendarStats` method — needs to be added to call `GET /api/stats/calendar`
- Android `StatsRepository` needs equivalent method for calendar stats

### Performance note

The 90d range is new (existing page only uses today/7d/30d). `getDailyBreakdown` fetches all entries in the range and processes in memory. The `foodEntries` table should have an index on `(userId, date)` to keep 90d queries fast. Verify this exists before shipping.

## Color Scheme

- Calories: Blue (`MACRO_COLORS.calories`)
- Protein: Red (`MACRO_COLORS.protein`)
- Carbs: Orange (`MACRO_COLORS.carbs`)
- Fat: Yellow (`MACRO_COLORS.fat`)
- Fiber: Green (`MACRO_COLORS.fiber`)
- Calendar heatmap: Green (on target), Red (over), Blue (under), Gray (no data)

## Platforms

- **PWA (SvelteKit):** Primary implementation using LayerChart, shadcn-svelte, Tailwind CSS
- **Android (Jetpack Compose):** Material 3, custom Canvas for radar chart, Vico or custom Canvas for bar chart
