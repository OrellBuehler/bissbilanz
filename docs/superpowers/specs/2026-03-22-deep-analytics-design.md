# Deep Analytics & Sleep Tracking — Design Spec

## Overview

Extend Bissbilanz with deep nutritional analytics and sleep tracking. Six insight areas that correlate food consumption, meal timing, micronutrients, and sleep quality with weight changes and health outcomes.

## Insight Areas

1. **Chrononutrition Analysis** — Meal timing patterns vs. weight changes (eating window, late-night eating, meal spacing)
2. **Micronutrient Gaps & Weight** — Flag nutrient deficiencies correlating with weight plateaus
3. **Food-Sleep Correlations** — Which foods/nutrients improve or worsen sleep quality
4. **Sleep Tracking** — Manual logging (duration + quality required; bedtime, wake time, wake-ups optional) with schema for future wearable sync
5. **Caloric Lag Analysis** — Auto-detect personal response delay (1-7 days) between caloric intake and weight change, with user override
6. **Macro Composition Impact** — Protein/fat/carb ratio correlation with weight change rate

## Architecture Decisions

### Navigation & Page Structure

The existing `/insights` page becomes a tabbed analytics hub with three sub-tabs:

- **Nutrition** — existing insights (trends, goals, heatmap, radar, meal distribution, top foods) + new eating window analysis, meal spacing heatmap, nutrient adequacy dashboard
- **Weight** — absorbs current `/weight` page content (weight chart, log form, history) + new caloric lag detector, macro impact, meal timing correlation, micronutrient gap analysis
- **Sleep** — new sleep logging form + sleep trend chart + food-sleep correlations + nutrient-sleep matrix + pre-sleep eating window analysis

The standalone `/weight` route redirects to `/insights?tab=weight`.

### Computation Strategy

All correlation algorithms run **client-side** for offline capability and Android KMP compatibility. Server provides raw data; client computes correlations on demand.

### Algorithm Approach

**Approach B: Shared Algorithm Definitions, Platform Implementations.** Algorithms are defined once in specs with test vectors. Implemented natively in TypeScript (web) and Kotlin (KMP). Test vectors ensure parity across platforms.

Note: This spec covers the TypeScript (web) implementation. Kotlin (KMP) port is a separate follow-up project.

## Data Model

### New Table: `sleepEntries`

| Column                | Type            | Required | Notes                                   |
| --------------------- | --------------- | -------- | --------------------------------------- |
| `id`                  | UUID            | yes      | PK                                      |
| `userId`              | UUID            | yes      | FK → users                              |
| `entryDate`           | date            | yes      | unique per user                         |
| `durationMinutes`     | integer         | yes      | total sleep time                        |
| `quality`             | integer         | yes      | 1-10 rating                             |
| `bedtime`             | timestamp w/ tz | no       | optional                                |
| `wakeTime`            | timestamp w/ tz | no       | optional                                |
| `wakeUps`             | integer         | no       | number of times woken                   |
| `sleepLatencyMinutes` | integer         | no       | future: from wearable                   |
| `deepSleepMinutes`    | integer         | no       | future: from wearable                   |
| `lightSleepMinutes`   | integer         | no       | future: from wearable                   |
| `remSleepMinutes`     | integer         | no       | future: from wearable                   |
| `source`              | text            | no       | 'manual', 'health_connect', 'healthkit' |
| `notes`               | text            | no       |                                         |
| `loggedAt`            | timestamp w/ tz | yes      |                                         |

Constraints:

- `quality` CHECK: 1-10
- `durationMinutes` CHECK: >0 and ≤1440
- `wakeUps` CHECK: ≥0
- Unique index on (userId, entryDate)
- Index on userId for range queries

### New Table: `userAnalyticsPreferences`

| Column                   | Type    | Notes              |
| ------------------------ | ------- | ------------------ |
| `userId`                 | UUID    | PK, FK → users     |
| `caloricLagDaysOverride` | integer | null = auto-detect |
| `correlationWindowDays`  | integer | default 30         |

### No Changes to Existing Tables

`foodEntries.eatenAt` provides meal timing. `foods` table has all 43 extended nutrients. No schema changes needed.

## Algorithm Specifications

All algorithms share a common pattern: two numeric series in, correlation coefficient + confidence out.

### Algorithm 1: Pearson Correlation

- **Input:** two arrays of numbers (same length)
- **Output:** coefficient (-1 to +1), p-value, sample size, confidence level
- **Confidence thresholds:** <7 = insufficient, 7-13 = low, 14-29 = medium, 30+ = high
- **Filter:** correlations with |r| < 0.15 are treated as noise and not shown

### Algorithm 2: Time-Shifted Cross-Correlation (Caloric Lag)

- **Input:** daily calorie series, daily weight series, max lag (1-7 days)
- **Process:** compute Pearson at each lag offset, find strongest |r|
- **Output:** best lag (days), correlation at each offset, recommended lag
- **User override:** stored in `userAnalyticsPreferences.caloricLagDaysOverride`

### Algorithm 3: Moving Average

- **Input:** numeric series, window size (7, 14, or 30 days)
- **Output:** smoothed series with same length (null-padded at start)
- **Note:** extends existing weight moving average to support any series

### Algorithm 4: Meal Timing Pattern Extraction

- **Input:** food entries with `eatenAt` timestamps over a date range
- **Output:** eating window (first meal → last meal per day), average start/end times, late-night eating frequency (meals after 21:00), meal spacing distribution
- **Correlation:** eating window width vs. weight trend slope

### Algorithm 5: Nutrient-Outcome Correlation Matrix

- **Input:** daily nutrient totals (all 48 nutrients), outcome series (weight change or sleep quality)
- **Process:** Pearson correlation for each nutrient vs. outcome, with optional time lag
- **Output:** ranked list of nutrients by |correlation|, filtered by confidence threshold
- **Display threshold:** |r| > 0.3 flagged as "potentially impactful"

### Algorithm 6: Food-Sleep Pattern Detection

- **Input:** food entries from evening meals (after 17:00), sleep entries for corresponding nights
- **Process:** for each food eaten ≥5 times in the evening, compute average sleep quality delta from user's overall average on nights that food was eaten vs. nights it wasn't
- **Output:** foods positively or negatively associated with sleep quality, sorted by |delta|
- **Secondary:** per-nutrient correlation (same approach but aggregated by nutrient totals)

### Test Vectors

Each algorithm will have 5-10 test cases with known expected outputs, defined in a shared test vector file. Both TypeScript and future Kotlin implementations must pass all vectors.

## UI Design

### Insight Card Pattern

**Headline-first cards:** Each insight leads with a human-readable sentence (e.g. "Your weight responds 3 days after eating"), with supporting chart/visualization below. Confidence badge always visible.

**Domain color coding:**

- Weight correlations: blue (matches existing weight chart)
- Sleep correlations: purple (#a78bfa)
- Meal timing: amber (#f59e0b)
- Nutrients: green (matches existing fiber color)

### Confidence System

| Level        | Sample Size | Visual Treatment                                   |
| ------------ | ----------- | -------------------------------------------------- |
| Insufficient | <7 days     | Card hidden, progress prompt shown                 |
| Low          | 7-13 days   | Amber badge, dashed border, "keep logging" message |
| Medium       | 14-29 days  | Default styling, subtle "X days" badge             |
| High         | 30+ days    | No special treatment, sample count in footer       |

Rules:

- Correlations with |r| < 0.15 never shown
- Each insight card tracks its own data requirements independently
- New users see "Getting Started" state showing which insights unlock with more data

### Sleep Log Form

**Compact design:** Duration (hours:minutes) + quality slider (1-10) always visible. "More details" expandable section reveals bedtime, wake time, wake-ups. Matches existing app patterns for progressive disclosure.

### Insights Page Sub-tabs

Horizontal pill-style sub-tab bar below page header: **Nutrition | Weight | Sleep**

- URL structure: `/insights?tab=nutrition` (default), `/insights?tab=weight`, `/insights?tab=sleep`
- Tab state persisted in URL query param for shareability/bookmarking
- `/weight` redirects to `/insights?tab=weight`

### New Sections Per Tab

**Nutrition tab (existing + new):**

- Existing: Trends chart, Goal adherence, Calendar heatmap, Macro radar, Meal distribution, Top foods
- New: Eating Window Analysis (daily first-to-last meal visualization, window width trend)
- New: Meal Spacing Heatmap (hour × day-of-week frequency heatmap)
- New: Nutrient Adequacy Dashboard (weekly micronutrient coverage vs. RDA, traffic light indicators)

**Weight tab (relocated + new):**

- Relocated: Weight chart (moving avg + projection), Weight log form, Weight history list
- New: Caloric Lag Detector (auto-detected lag with bar chart of correlation per offset, slider override)
- New: Macro Impact on Weight (bar chart of macro correlations with weight change rate)
- New: Meal Timing & Weight (eating window width vs. weight change scatter)
- New: Micronutrient Gaps (heatmap of nutrient adequacy vs. weight trend)

**Sleep tab (all new):**

- Sleep Log Form (compact with expandable details)
- Sleep Trend Chart (dual-axis: duration bars + quality line, 7/30/90d range)
- Food → Sleep Correlations (ranked food lists: helps/hurts sleep)
- Nutrient → Sleep Matrix (nutrient correlations with sleep quality)
- Pre-Sleep Eating Window (dinner-to-bed gap vs. sleep quality correlation)

## API Routes

### Sleep CRUD

- `GET /api/sleep` — list sleep entries (with date range filter)
- `POST /api/sleep` — create/upsert sleep entry
- `GET /api/sleep/[id]` — get single entry
- `PATCH /api/sleep/[id]` — update entry
- `DELETE /api/sleep/[id]` — delete entry

### Analytics Data Endpoints

- `GET /api/analytics/weight-food` — daily calorie + weight series for date range (raw data for client-side correlation)
- `GET /api/analytics/nutrients-daily` — daily nutrient totals (all 48) for date range
- `GET /api/analytics/meal-timing` — food entries with eatenAt timestamps for date range
- `GET /api/analytics/sleep-food` — evening food entries + sleep data for correlation
- `GET /api/analytics/preferences` — user analytics preferences
- `PATCH /api/analytics/preferences` — update preferences (lag override, window)

### Validation

All inputs validated with Zod schemas in `src/lib/server/validation/sleep.ts` and `src/lib/server/validation/analytics.ts`.

## i18n

All new UI strings added to both `messages/en.json` and `messages/de.json`. Key prefixes:

- `sleep_*` — sleep tracking UI
- `analytics_*` — analytics/correlation UI
- `confidence_*` — confidence level labels
- `insights_tab_*` — sub-tab labels

## MCP Integration

Extend existing MCP tools to support sleep logging:

- `log_sleep` — log sleep entry via AI agent
- `get_sleep_status` — get recent sleep data
- Add sleep context to existing food logging tools for AI to reference

## Implementation Phases

### Phase 1: Foundation

- Database schema (sleepEntries, userAnalyticsPreferences)
- Migration generation
- Sleep CRUD API routes + validation
- Sleep Zod schemas
- Analytics data API endpoints

### Phase 2: Analytics Engine

- Core algorithm library (`src/lib/analytics/`)
- Pearson correlation
- Time-shifted cross-correlation
- Moving average (generalized)
- Meal timing extraction
- Nutrient-outcome correlation matrix
- Food-sleep pattern detection
- Test vectors + unit tests for all algorithms

### Phase 3: Insights Page Restructure

- Sub-tab navigation (Nutrition / Weight / Sleep)
- Relocate weight page content to Weight sub-tab
- `/weight` redirect
- Preserve all existing insight sections in Nutrition tab

### Phase 4: Sleep UI

- Sleep log form (compact with expandable details)
- Sleep trend chart
- Sleep history list
- Sleep service (client-side state management)

### Phase 5: Weight Analytics UI

- Caloric Lag Detector card
- Macro Impact on Weight card
- Meal Timing & Weight card
- Micronutrient Gaps card

### Phase 6: Sleep Analytics UI

- Food → Sleep Correlations card
- Nutrient → Sleep Matrix card
- Pre-Sleep Eating Window card

### Phase 7: Nutrition Analytics UI

- Eating Window Analysis section
- Meal Spacing Heatmap section
- Nutrient Adequacy Dashboard section

### Phase 8: MCP + Polish

- MCP sleep tools
- Low-data / getting started states
- Confidence badges across all cards
- i18n completion
- Integration tests

## Out of Scope (This Quarter)

- Health Connect / Apple HealthKit sync (schema ready, sync deferred)
- Kotlin KMP algorithm port (spec + test vectors available for next quarter)
- Sleep stage tracking UI (columns exist but hidden until wearable sync)
- AI-powered insight summaries (potential future feature)
