# Feature Research: Supplements, Weight Tracking, Favorites

**Project:** Bissbilanz (food tracking PWA)
**Research Type:** Features dimension — subsequent milestone
**Date:** 2026-02-17
**Context:** Adding supplement tracking, weight tracking, and favorites system to an existing food tracking app that already has food CRUD, meal-based entry logging, recipes, macro goals, barcode scanning, and MCP AI integration.

---

## Domain Overview

Health and nutrition tracking apps (MyFitnessPal, Cronometer, MacroFactor, Lifesum, Fitia, MacroFactor, Happy Scale, SuppTrack, Human Health) have established strong conventions for these three feature areas. The space divides cleanly into: what users demand and abandon apps over (table stakes), what separates the good apps from the mediocre ones (differentiators), and what adds complexity without meaningful benefit (anti-features).

---

## 1. Supplement Tracking

### Table Stakes

| Feature                                               | Complexity | Notes                                                    |
| ----------------------------------------------------- | ---------- | -------------------------------------------------------- |
| Define a list of daily supplements (name, dose, unit) | Low        | Core data model: supplement definitions per user         |
| Daily check-off: mark each supplement as taken        | Low        | One boolean toggle per supplement per day                |
| View today's supplement completion status             | Low        | List with taken/not-taken state                          |
| Persist adherence history (was it taken on date X?)   | Low        | Log table: user + supplement + date + taken_at timestamp |
| Reset check-offs each day automatically               | Low        | Derived from current date vs log date                    |

**Why table stakes:** Users who want supplement tracking will immediately abandon an app that can't show them whether they took today's dose. The daily reset + check-off loop is the minimum viable interaction.

### Differentiators

| Feature                                                      | Complexity | Notes                                                      |
| ------------------------------------------------------------ | ---------- | ---------------------------------------------------------- |
| Time-of-day scheduling (morning / noon / evening / custom)   | Medium     | Allows "take with breakfast" vs "before bed" semantics     |
| Adherence streaks (N days in a row)                          | Medium     | Motivational; used by Human Health, MyTherapy, Bearable    |
| Reminder notifications (push/PWA)                            | High       | PWA push requires service worker + notification permission |
| Multiple doses per day per supplement                        | Medium     | e.g., "Vitamin C: 500mg at 8am, 500mg at 2pm"              |
| Supplement-to-nutrient mapping (add to micronutrient totals) | High       | Requires nutrient database; Cronometer does this           |
| Barcode scanning for supplement products                     | High       | SuppTrack's key feature; high complexity for marginal gain |
| Goal-based supplement stacks (pre-defined groupings)         | Medium     | SuppTrack, SuppCo feature; power-user territory            |
| Weekly/monthly adherence heatmap or calendar view            | Medium     | Good for reviewing patterns                                |

**Dependencies:**

- Time-of-day scheduling enables meaningful reminder notifications
- Streaks depend on adherence history being stored correctly
- Supplement-to-nutrient mapping requires a micronutrient database (not currently in Bissbilanz schema)

### Anti-Features

| Feature                                     | Reason to Avoid                                                       |
| ------------------------------------------- | --------------------------------------------------------------------- |
| Drug interaction warnings                   | Medical liability; requires verified pharmaceutical database          |
| Supplement recommendations / AI suggestions | Requires medical expertise; out of scope for food tracker             |
| Supplement store / purchase integration     | Monetization complexity unrelated to tracking                         |
| Barcode scanning for supplements            | High complexity, edge case; most supplements aren't in food databases |
| Full micronutrient database integration     | Major scope expansion; separate milestone if ever                     |

### What the Project Already Has

The schema already includes `supplements` and `supplement_logs` tables (added in the recent milestone commits). The API endpoints (CRUD, logs, today, history) and server module with tests are also done. The schedule utilities are implemented. This means table stakes are largely already built at the data layer — the remaining work is UI/UX.

---

## 2. Weight Tracking

### Table Stakes

| Feature                                      | Complexity | Notes                                          |
| -------------------------------------------- | ---------- | ---------------------------------------------- |
| Log a weight entry with timestamp            | Low        | Input: weight value + unit (kg/lbs) + datetime |
| View history of weight entries               | Low        | Ordered list or table                          |
| Line chart showing weight over time          | Medium     | Time-series chart; core motivational tool      |
| Adjustable time range (7d / 30d / 90d / all) | Low        | Filter on existing data                        |
| Delete/edit a logged entry                   | Low        | Standard CRUD                                  |
| Unit selection (kg vs lbs)                   | Low        | Stored in user settings or per-entry           |

**Why table stakes:** MyFitnessPal community threads show users actively look for and complain about missing weight graphs. The chart is the reason people log weight — without it, there's no feedback loop. Apps that hide or remove weight charts (MFP's update saga) face immediate user backlash.

### Differentiators

| Feature                                                             | Complexity | Notes                                                          |
| ------------------------------------------------------------------- | ---------- | -------------------------------------------------------------- |
| Smoothed trend line (7-day moving average or exponential smoothing) | Medium     | Happy Scale, MacroFactor, Libra do this; reduces noise anxiety |
| Goal weight line overlaid on chart                                  | Low        | Visual target marker                                           |
| BMI calculation and display                                         | Low        | Requires height in user profile                                |
| Rate of change display (e.g., "−0.3 kg/week")                       | Medium     | Derived from trend; requires smoothing                         |
| Progress toward goal (% complete, days remaining estimate)          | Medium     | Happy Scale's differentiator                                   |
| Multiple body measurements (body fat %, waist, etc.)                | High       | Separate data model; major scope expansion                     |
| Wearable sync (Apple Health, Google Fit, Garmin)                    | Very High  | Platform integration; major scope                              |
| Morning weight prompt / reminder                                    | Medium     | PWA push; requires notification infrastructure                 |

**Dependencies:**

- Smoothed trend line requires at least 7 data points to be meaningful
- Rate of change display depends on trend smoothing being accurate
- BMI requires height stored in user profile (not currently in schema)
- Goal weight needs a target field in user settings

### Anti-Features

| Feature                                           | Reason to Avoid                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| Body composition analysis (DEXA estimation, etc.) | Requires hardware sensors; pseudoscience without them              |
| Calorie adjustment based on weight trend          | Algorithm complexity; MacroFactor's core IP, not worth replicating |
| Social weight sharing / leaderboards              | Privacy-sensitive; body weight is not social content               |
| Predictive goal-reach date with high precision    | Creates anxiety; date math with biological variables is unreliable |
| Multiple body measurements as launch scope        | Scope creep; weight alone covers 90% of user need                  |

### Key UX Insight

MyFitnessPal's community shows frustration when the weight chart shows a flat line between entries (it doesn't interpolate). The best pattern is to show only actual data points connected by lines, with a separate smoothed trend overlay. Do not fill in gaps — users know when they didn't weigh in.

---

## 3. Favorites System

### Table Stakes

| Feature                                               | Complexity | Notes                                        |
| ----------------------------------------------------- | ---------- | -------------------------------------------- |
| Mark any food or recipe as a favorite                 | Low        | Boolean flag or favorites join table         |
| View favorites list                                   | Low        | Filtered view of existing food/recipe UI     |
| Tap a favorite to log it (pre-populated entry form)   | Medium     | Navigate to log entry with food pre-selected |
| Remove a favorite                                     | Low        | Standard toggle                              |
| Favorites appear in food search results (prioritized) | Medium     | Sort or section boost in search              |

**Why table stakes:** The whole value of favorites is reducing friction for repeat logging. If users have to search through the full database every time for their daily oatmeal or protein shake, they stop logging. Recent/frequent foods help but favorites give user-controlled signal.

### Differentiators

| Feature                                                                   | Complexity | Notes                                                          |
| ------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------- |
| Saved serving size with favorite (log instantly, no amount prompt)        | Medium     | MacroFactor's key UX: heart saves food + serving size together |
| Multiple serving presets per food (e.g., "small coffee" + "large coffee") | Medium     | MacroFactor v4.4 feature                                       |
| Configurable tap behavior: instant log vs choose-servings dialog          | Medium     | The project spec already calls for this                        |
| Image cards for favorites (visual grid vs list)                           | Low-Medium | Visual recognition is faster than reading food names           |
| Reorder favorites manually                                                | Low        | Drag-and-drop or up/down arrows                                |
| Favorites widget on dashboard (hideable)                                  | Medium     | Quick access without navigating to favorites page              |
| Favorite meals (log multiple items at once)                               | High       | Separate "meals" concept; high complexity                      |
| Usage frequency sorting (auto-promote most-used)                          | Low        | Sort by log count                                              |

**Dependencies:**

- Saved serving size requires the favorites join table to store a quantity + unit field
- Configurable tap behavior (instant vs choose) requires user preference setting
- Dashboard widget depends on the settings system for widget visibility (already in scope per project context)
- Image cards depend on whether foods have images attached (barcode scan foods may have them from Open Food Facts; user-created foods typically don't)

### Anti-Features

| Feature                                          | Reason to Avoid                                             |
| ------------------------------------------------ | ----------------------------------------------------------- |
| Algorithmic "smart favorites" that auto-populate | Unpredictable; users want control over their favorites list |
| Favorite meal plans or diet templates            | Meal planning is a separate feature domain; scope creep     |
| Sharing favorites with other users               | Social features are out of scope for this app               |
| Unlimited favorite categories/folders            | Over-organization; most users have 10-20 favorites total    |
| AI-generated serving size recommendations        | Adds AI dependency where simple user input suffices         |

### UX Pattern Notes

MacroFactor's research shows the "Favorites Bar" positioned above search results (not buried in a separate tab) is the optimal placement. The key insight: favorites must be visible at the moment of intent (when a user opens the food search to log something), not just accessible from a dedicated page.

For Bissbilanz's PWA context, a prominent section at the top of the food search/log flow is more effective than a dedicated favorites tab. The tab can exist for management (reorder, remove) but the favorites should surface in the logging flow.

---

## Cross-Feature Dependencies

```
Supplement Tracking
  └── Supplements schema + API (DONE)
  └── Schedule utilities (DONE)
  └── Dashboard widget → Settings widget visibility system

Weight Tracking
  └── Needs new schema: weight_logs table
  └── Chart component (line chart library already exists for macros)
  └── Dashboard widget → Settings widget visibility system
  └── [Optional] Height field in user profile for BMI

Favorites System
  └── Needs schema: user_favorites table (food_id or recipe_id + quantity + unit)
  └── Needs food search to surface favorites first
  └── Dashboard widget → Settings widget visibility system
  └── Tap behavior setting → User preferences schema

Settings Widget Visibility (shared dependency)
  └── All three features add dashboard widgets
  └── Widget visibility must be per-user, persisted to DB
  └── This is the foundational enabler for the "hideable dashboard" requirement
```

---

## Prioritization Matrix

| Feature                                 | User Value | Implementation Complexity | Priority                        |
| --------------------------------------- | ---------- | ------------------------- | ------------------------------- |
| Daily supplement check-off UI           | High       | Low                       | Must have (schema already done) |
| Weight log entry + line chart           | High       | Medium                    | Must have                       |
| Mark food/recipe as favorite            | High       | Low                       | Must have                       |
| Tap favorite to log (instant/choose)    | High       | Medium                    | Must have                       |
| Supplement adherence history            | Medium     | Low                       | Should have                     |
| Weight smoothed trend line              | Medium     | Medium                    | Should have                     |
| Saved serving size with favorite        | High       | Medium                    | Should have                     |
| Supplement time-of-day scheduling       | Medium     | Medium                    | Should have                     |
| Favorites image card grid               | Low        | Medium                    | Nice to have                    |
| Weight BMI display                      | Low        | Low                       | Nice to have                    |
| Supplement streaks                      | Low        | Medium                    | Nice to have                    |
| PWA push reminders (supplements/weight) | Medium     | High                      | Later milestone                 |
| Supplement-to-nutrient mapping          | Low        | Very High                 | Anti-feature (for now)          |
| Multiple body measurements              | Low        | High                      | Anti-feature (for now)          |
| Wearable sync                           | Low        | Very High                 | Anti-feature (for now)          |

---

## Sources

- [MacroFactor Favorite Foods feature page](https://macrofactor.com/favorite-foods/)
- [MacroFactor Favorite Foods help article](https://help.macrofactorapp.com/en/articles/257-favorite-foods)
- [MacroFactor best food logging app](https://macrofactorapp.com/best-food-logging-app/)
- [MacroFactor weight trend explanation](https://help.macrofactorapp.com/en/articles/21-weight-trend)
- [Happy Scale app](https://happyscale.com/)
- [Human Health supplement tracker](https://www.human.health/features/supplement-tracker)
- [SuppTrack app](https://supptrack.app/)
- [CareClinic supplement tracker](https://careclinic.io/supplement-tracker/)
- [MyFitnessPal supplement tracking help](https://support.myfitnesspal.com/hc/en-us/articles/360032621751-How-can-I-track-vitamins-medications-or-supplements)
- [MyFitnessPal weight recording help](https://support.myfitnesspal.com/hc/en-us/articles/360032624431-How-do-I-record-my-weight-and-other-measurements)
- [Dietary supplement tracking apps overview](https://theinfluencerforum.com/dietary-supplement-tracking-apps/)
- [Best calorie counter apps comparison 2026](https://www.garagegymreviews.com/best-calorie-counter-apps)
- [Cronometer vs MyFitnessPal comparison](https://www.katelynannutrition.com/blog/cronometer-vs-mfp)
- [7 best free weight tracking apps 2025](https://bodly.app/blog/the-7-best-free-weight-tracking-apps-in-2025)
- [Best food tracking apps 2025 guide](https://fitia.app/learn/article/best-food-tracking-apps-2025-complete-guide/)
