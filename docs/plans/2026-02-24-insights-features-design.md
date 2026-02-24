# Insights Features Design

Three independent features to transform the app from "what did I eat" to "how am I doing."

---

## Feature 1: Dashboard Goal Progress Rings

### Goal

Replace the existing donut chart (macro pie split) with circular progress rings showing consumed vs. goal for each macro + calories. At a glance: "how much is left today."

### Design

**New component:** `src/lib/components/charts/GoalProgressRings.svelte`

Five concentric rings (outermost to innermost): Calories (blue), Protein (red), Carbs (orange), Fat (yellow), Fiber (green). Each ring fills proportionally to `consumed / goal`. Overflow (>100%) shown with a pulsing/striped visual cue.

Below the rings: a legend row with 5 compact pills showing `consumed / goal` values and percentage.

**Data flow:**

- The dashboard already has `daylogTotals: MacroTotals` (from DayLog's `onTotalsChange`)
- Fetch goals via `GET /api/goals` on mount (already available)
- Pass both `totals` and `goals` to the new component

**Changes:**
| File | Change |
|---|---|
| `src/lib/components/charts/GoalProgressRings.svelte` | New component — SVG rings with animated fill |
| `src/routes/(app)/+page.svelte` | Fetch goals, replace `DailyMacroChart` with `GoalProgressRings` in the `chart` widget slot |
| `messages/en.json` | Add keys: `dashboard_goal_progress`, `dashboard_remaining`, `dashboard_over` |
| `messages/de.json` | German translations for the above |

**Implementation notes:**

- Pure SVG — no chart library needed. Each ring is an `<circle>` with `stroke-dasharray` and `stroke-dashoffset` for fill animation
- If no goals are set, fall back to the existing `DailyMacroChart` donut
- Use CSS transitions on `stroke-dashoffset` for smooth animation on data change
- Mobile-first: rings ~180px diameter on mobile, ~220px on sm+

---

## Feature 2: Calendar Heatmap

### Goal

Color-code days on the history calendar by calorie adherence relative to goals. Instantly see consistency patterns across a month.

### Design

**Color scheme (4 states):**

- **Gray** (`bg-muted`) — no entries logged
- **Green** (`emerald-500/60`) — within 10% of calorie goal
- **Orange** (`amber-500/60`) — logged but >10% under or over goal
- **Red** (`rose-500/60`) — no goal set but has entries (neutral indicator — use subtle blue instead)

Simplified: if no goal is set, days with entries get a subtle blue dot/bg, days without stay gray. If a goal exists, green = on target (±10%), amber = off target.

**New API endpoint:** `GET /api/stats/calendar?month=YYYY-MM`

Returns: `{ days: Record<string, { calories: number; hasEntries: boolean }> }`

This is a lightweight query — just sum calories per day for a month, grouped by date.

**Changes:**
| File | Change |
|---|---|
| `src/lib/server/stats.ts` | Add `getCalendarStats(userId, year, month)` — query entries for the month, return daily calorie sums |
| `src/routes/api/stats/calendar/+server.ts` | New GET endpoint calling `getCalendarStats` |
| `src/routes/(app)/history/+page.svelte` | Fetch calendar data + goals, compute `dayColors`, pass to `Calendar` |
| `src/lib/components/history/Calendar.svelte` | Improve styling — use a colored dot or bg tint instead of raw `background-color` inline style. Add a small legend below the grid. |
| `messages/en.json` | Add keys: `calendar_on_target`, `calendar_off_target`, `calendar_no_data` |
| `messages/de.json` | German translations |

**Implementation notes:**

- Fetch calendar data when month changes (reactive `$effect`)
- The Calendar component already accepts `dayColors: Record<string, string>` — use this, but enhance the rendering to use Tailwind classes with opacity for a cleaner look
- Goals fetched once on page mount (reuse across month navigation)

---

## Feature 3: Logging Streaks

### Goal

Show current consecutive-day logging streak and all-time longest streak on the dashboard. Motivate consistent logging.

### Design

**New API endpoint:** `GET /api/stats/streaks`

Returns: `{ currentStreak: number; longestStreak: number; lastLoggedDate: string | null }`

Computed server-side: query all distinct dates with entries for the user, ordered descending. Walk backwards from today counting consecutive days. For longest streak, walk the full sorted list.

**New component:** `src/lib/components/dashboard/StreakWidget.svelte`

A compact `DashboardCard` (tone: amber, icon: Flame) showing:

- Current streak as a large number with "days" label
- Longest streak as smaller secondary text
- If current streak equals longest: show a "personal best" badge

**Dashboard integration:**

- Add `'streaks'` to the widget order system
- Show on all days (not just today), since streaks are always relevant
- Default position: after the chart, before favorites

**Changes:**
| File | Change |
|---|---|
| `src/lib/server/stats.ts` | Add `getStreaks(userId)` — query distinct entry dates, compute streaks |
| `src/routes/api/stats/streaks/+server.ts` | New GET endpoint |
| `src/lib/components/dashboard/StreakWidget.svelte` | New widget component |
| `src/routes/(app)/+page.svelte` | Fetch streaks, add `'streaks'` section to widget rendering |
| `src/lib/server/schema.ts` | Add `'streaks'` to `widgetOrder` default if not already configurable |
| `messages/en.json` | Add keys: `streaks_title`, `streaks_days`, `streaks_longest`, `streaks_personal_best` |
| `messages/de.json` | German translations |

**Implementation notes:**

- The streak calculation should handle "today not yet logged" gracefully — if the last logged date is yesterday, the streak is still alive
- Cache-friendly: streaks don't change often, so a simple fetch on mount is fine
- No database schema changes needed — computed from existing `food_entries` table

---

## Implementation Order

Each feature is fully independent. They can be built in parallel on separate branches:

1. **Feature 1 (Goal Progress Rings)** — highest visual impact on the daily workflow
2. **Feature 2 (Calendar Heatmap)** — highest impact on the history page
3. **Feature 3 (Logging Streaks)** — motivational, adds a new widget type

Each feature should be a separate PR for clean review.
