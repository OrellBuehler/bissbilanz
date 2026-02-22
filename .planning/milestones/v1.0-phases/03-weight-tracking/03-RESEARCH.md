# Phase 3: Weight Tracking - Research

**Researched:** 2026-02-19
**Domain:** Weight logging, trend charting, dashboard widget integration
**Confidence:** HIGH

## Summary

Weight tracking is a straightforward CRUD feature that closely mirrors existing patterns in the codebase -- particularly the supplements module (user-scoped entries, list views, dashboard widget, timestamp-based logging). The schema needs a single new `weightEntries` table. The API follows the same `requireAuth` + Zod validation + Result pattern used throughout.

The chart requirement (line chart with 7-day moving average overlay) is the most technically interesting piece. The project uses layerchart 2.0.0-next.43, which supports `LineChart` with multi-series via the `series` prop. The 7-day moving average should be computed server-side for correctness and then passed as a second series to the chart. Drizzle ORM's `sql` template literal supports window functions needed for the rolling average.

**Primary recommendation:** Follow the supplements module pattern exactly for schema/API/validation, compute the 7-day moving average server-side using a SQL window function via Drizzle's `sql` escape hatch, and use layerchart's `LineChart` with two series (raw weight + trend).

<phase_requirements>

## Phase Requirements

| ID      | Description                                                                 | Research Support                                                                                                                                           |
| ------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WGHT-01 | User can log body weight at any time (stores timestamp, not just date)      | Schema stores `loggedAt` (timestamp with timezone) AND `entryDate` (date) per prior decision P-W1; follows supplementLogs pattern with `takenAt` + `date`  |
| WGHT-02 | Weight stored in kg (single unit, no conversion)                            | Single `weightKg` real column, no unit enum needed                                                                                                         |
| WGHT-03 | User can view weight history as list with edit/delete                       | Standard CRUD API endpoints following supplements pattern; list query with date range filtering                                                            |
| WGHT-04 | Line chart shows weight over time with selectable range (7d, 30d, 90d, all) | layerchart LineChart component with series prop; ChartRangeSelector already exists but needs 90d added                                                     |
| WGHT-05 | Smoothed trend line (7-day moving average) overlaid on weight chart         | Server-side SQL window function `AVG(weight_kg) OVER (ORDER BY entry_date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)`; passed as second series to LineChart |
| WGHT-06 | Dashboard weight widget shows latest weight (hideable in settings)          | `showWeightWidget` already exists in userPreferences schema and settings page; widget reads from new `/api/weight/latest` endpoint                         |
| WGHT-07 | Dedicated weight page at /app/weight with chart, history, and log form      | New SvelteKit route at `src/routes/app/weight/+page.svelte`; add to navigation config                                                                      |

</phase_requirements>

## Standard Stack

### Core (already in project)

| Library        | Version        | Purpose                      | Why Standard                                               |
| -------------- | -------------- | ---------------------------- | ---------------------------------------------------------- |
| Drizzle ORM    | bun-sql driver | Schema, queries, migrations  | Already used for all DB operations                         |
| Zod            | (existing)     | Input validation             | Used for all API validation schemas                        |
| layerchart     | 2.0.0-next.43  | Line chart with multi-series | Already used for CalorieTrendChart and MacroBreakdownChart |
| shadcn-svelte  | (existing)     | Card, Button, Input UI       | All existing pages use these                               |
| @lucide/svelte | (existing)     | Icons                        | Weight icon available                                      |
| Paraglide      | (existing)     | i18n messages                | en/de support                                              |

### No New Dependencies Needed

This phase requires zero new packages. Everything is achievable with the existing stack.

## Architecture Patterns

### Recommended File Structure

```
src/
├── lib/
│   ├── components/
│   │   └── weight/
│   │       ├── WeightChart.svelte          # Line chart with trend overlay
│   │       ├── WeightHistoryList.svelte     # List view with edit/delete
│   │       ├── WeightLogForm.svelte         # Log form (inline, not modal)
│   │       └── WeightWidget.svelte          # Dashboard widget
│   ├── server/
│   │   ├── weight.ts                        # DB operations (CRUD + stats)
│   │   └── validation/
│   │       └── weight.ts                    # Zod schemas
│   └── utils/
│       └── (no new utils needed)
├── routes/
│   ├── api/
│   │   └── weight/
│   │       ├── +server.ts                   # GET (list), POST (create)
│   │       ├── [id]/
│   │       │   └── +server.ts               # PATCH, DELETE
│   │       └── latest/
│   │           └── +server.ts               # GET latest for dashboard widget
│   └── app/
│       └── weight/
│           └── +page.svelte                 # Dedicated weight page
```

### Pattern 1: Schema Definition (following supplements)

**What:** New `weightEntries` table with user-scoping, timestamp + date dual storage
**When to use:** This is the only schema addition needed
**Example:**

```typescript
// In src/lib/server/schema.ts
export const weightEntries = pgTable(
	'weight_entries',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		weightKg: real('weight_kg').notNull(),
		entryDate: date('entry_date').notNull(),
		loggedAt: timestamp('logged_at', { withTimezone: true }).notNull(),
		notes: text('notes'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
	},
	(table) => [
		index('idx_weight_entries_user_date').on(table.userId, table.entryDate),
		index('idx_weight_entries_user_logged').on(table.userId, table.loggedAt)
	]
);
```

Key design decisions:

- `weightKg` as `real` -- same type used for all numeric values in the project (calories, protein, servings, etc.)
- `entryDate` (date) -- the user-local date, avoids UTC drift per prior decision P-W1
- `loggedAt` (timestamp with timezone) -- exact moment of logging per WGHT-01
- No unique constraint on (userId, entryDate) -- user can log multiple times per day
- Notes field is optional -- allows user to annotate entries

### Pattern 2: Server Module (Result pattern)

**What:** `src/lib/server/weight.ts` following the exact pattern from `supplements.ts`
**Example:**

```typescript
// Same Result<T> type pattern used in supplements.ts and preferences.ts
type SuccessResult<T> = { success: true; data: T };
type ErrorResult = { success: false; error: ZodError | Error };
type Result<T> = SuccessResult<T> | ErrorResult;

export const createWeightEntry = async (
	userId: string,
	payload: unknown
): Promise<Result<typeof weightEntries.$inferSelect>> => {
	const result = weightCreateSchema.safeParse(payload);
	if (!result.success) {
		return { success: false, error: result.error };
	}
	// ... insert with .returning()
};
```

### Pattern 3: 7-Day Moving Average (SQL window function)

**What:** Compute rolling average server-side using Drizzle's `sql` template literal
**Key insight:** Drizzle's query builder does not natively support window functions. Use the `sql` escape hatch, which is already used in the codebase (see `favorites.ts` for `sql` usage in ORDER BY).
**Example:**

```typescript
import { sql } from 'drizzle-orm';

export const getWeightWithTrend = async (userId: string, from: string, to: string) => {
	const db = getDB();
	return db
		.select({
			id: weightEntries.id,
			weightKg: weightEntries.weightKg,
			entryDate: weightEntries.entryDate,
			loggedAt: weightEntries.loggedAt,
			notes: weightEntries.notes,
			movingAvg: sql<number>`AVG(${weightEntries.weightKg}) OVER (
        ORDER BY ${weightEntries.entryDate}
        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
      )`.as('moving_avg')
		})
		.from(weightEntries)
		.where(
			and(
				eq(weightEntries.userId, userId),
				gte(weightEntries.entryDate, from),
				lte(weightEntries.entryDate, to)
			)
		)
		.orderBy(weightEntries.entryDate);
};
```

**Important:** If a user logs multiple entries on the same date, the moving average should use ONE value per day (latest entry). This requires either a subquery or using `DISTINCT ON`. The simpler approach: aggregate per day first, then compute the moving average.

**Refined approach with daily aggregation:**

```typescript
// Use raw SQL for the full query when window functions + aggregation are needed
const result = await db.execute(sql`
  WITH daily AS (
    SELECT DISTINCT ON (entry_date)
      entry_date, weight_kg
    FROM weight_entries
    WHERE user_id = ${userId}
      AND entry_date >= ${from}
      AND entry_date <= ${to}
    ORDER BY entry_date, logged_at DESC
  )
  SELECT
    entry_date,
    weight_kg,
    AVG(weight_kg) OVER (
      ORDER BY entry_date
      ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    ) as moving_avg
  FROM daily
  ORDER BY entry_date
`);
```

### Pattern 4: LineChart with Multi-Series (layerchart)

**What:** Two overlapping line series -- raw weight data points and smoothed trend
**Example:**

```typescript
// In WeightChart.svelte
import { LineChart } from 'layerchart';

const series = [
	{ key: 'weightKg', label: m.weight_actual(), color: '#8B5CF6' },
	{ key: 'movingAvg', label: m.weight_trend(), color: '#F97316' }
];

// Use seriesLayout="overlap" (default) so both lines render independently
```

The existing CalorieTrendChart uses `AreaChart` with similar props/tooltip configuration -- replicate that tooltip styling for consistency.

### Pattern 5: ChartRangeSelector Enhancement

**What:** The existing `ChartRangeSelector.svelte` supports 7d, 30d, and custom. WGHT-04 requires 7d, 30d, 90d, and all.
**Approach:** Either extend the existing component to accept configurable ranges, or create a new `WeightRangeSelector` specific to the weight page. Extending the existing component is cleaner since history charts may also want 90d/all in the future.

### Pattern 6: Dashboard Widget

**What:** Small card showing latest weight, matching style of existing widgets (FavoritesWidget, SupplementChecklist)
**Gating:** `userPrefs?.showWeightWidget` -- already wired in settings page and schema
**Data:** Fetch from `/api/weight/latest` endpoint

### Anti-Patterns to Avoid

- **Computing moving average client-side:** Wastes bandwidth sending extra historical data and is error-prone with gaps. Compute in SQL.
- **Using `db:push` for schema changes:** NEVER. Use `db:generate` per project convention.
- **Storing weight in localStorage:** All data goes through the API and PostgreSQL per project conventions.
- **Adding unit conversion at this stage:** WGHT-02 explicitly says kg only, no conversion.

## Don't Hand-Roll

| Problem              | Don't Build         | Use Instead                 | Why                                                   |
| -------------------- | ------------------- | --------------------------- | ----------------------------------------------------- |
| Moving average       | Custom JS smoothing | SQL window function         | Handles gaps, pagination-safe, single source of truth |
| Chart rendering      | Custom SVG lines    | layerchart LineChart        | Already in project, handles tooltips/axes/responsive  |
| Date range selection | Custom date picker  | Extended ChartRangeSelector | Existing pattern, consistent UX                       |
| Form validation      | Manual checks       | Zod schema                  | Project convention, error format consistency          |

## Common Pitfalls

### Pitfall 1: UTC Date Drift

**What goes wrong:** User logs weight at 11pm local time, server stores it as next day in UTC
**Why it happens:** Using `new Date().toISOString().slice(0, 10)` on server gives UTC date, not user-local date
**How to avoid:** Client sends `entryDate` (user's local date) alongside the request. Server stores it as-is. This is the prior decision P-W1.
**Warning signs:** Weight entries appearing on wrong dates in the list/chart

### Pitfall 2: Moving Average with Gaps

**What goes wrong:** If a user doesn't log for several days, the 7-day moving average window still looks at 6 preceding ROWS (not calendar days)
**Why it happens:** `ROWS BETWEEN 6 PRECEDING` counts actual data rows, not calendar days
**How to avoid:** This is actually acceptable behavior -- the average smooths over the last 7 entries. If calendar-day precision is needed, fill gaps with NULL entries. For simplicity, row-based is fine and matches user expectations (average of recent entries).
**Warning signs:** Sudden jumps in the trend line after logging gaps

### Pitfall 3: Multiple Entries Per Day

**What goes wrong:** Chart shows multiple points for the same date, cluttering the visualization
**Why it happens:** No unique constraint on (userId, entryDate) -- users can log multiple times
**How to avoid:** The chart API uses `DISTINCT ON (entry_date) ... ORDER BY entry_date, logged_at DESC` to pick the latest entry per day for charting. The history list shows all entries.
**Warning signs:** Duplicate x-axis labels in the chart

### Pitfall 4: layerchart Series with Missing Data

**What goes wrong:** Moving average is null/undefined for the first few entries (not enough preceding data), causing chart errors
**Why it happens:** Window function returns a valid average even for the first row (it just averages 1 value), so this is less of an issue than expected. But if using LEFT JOIN or gaps, nulls can appear.
**How to avoid:** Filter out null movingAvg values or ensure the SQL always returns a numeric value (AVG with even 1 row returns a number).

### Pitfall 5: Widget Visibility Already Wired

**What goes wrong:** Developer creates a new preference field for widget visibility
**Why it happens:** Not realizing `showWeightWidget` already exists in schema, settings page, and preferences module
**How to avoid:** Use the existing `showWeightWidget` field. It's already in `userPreferences` table, `DEFAULT_PREFERENCES`, validation schema, and settings UI.

## Code Examples

### Validation Schema

```typescript
// src/lib/server/validation/weight.ts
import { z } from 'zod';

export const weightCreateSchema = z.object({
	weightKg: z.coerce.number().positive().max(500),
	entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	notes: z.string().optional().nullable()
});

export const weightUpdateSchema = z.object({
	weightKg: z.coerce.number().positive().max(500).optional(),
	entryDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
	notes: z.string().optional().nullable()
});
```

### API Route (POST)

```typescript
// src/routes/api/weight/+server.ts -- follows supplements pattern exactly
export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		const userId = requireAuth(locals);
		const body = await request.json();
		const result = await createWeightEntry(userId, body);
		if (!result.success) {
			if (isZodError(result.error)) {
				return validationError(result.error);
			}
			throw result.error;
		}
		return json({ entry: result.data }, { status: 201 });
	} catch (error) {
		return handleApiError(error);
	}
};
```

### Dashboard Widget Loading

```typescript
// In src/routes/app/+page.svelte -- add alongside existing supplement loading
let latestWeight: { weightKg: number; entryDate: string } | null = $state(null);

const loadLatestWeight = async () => {
	try {
		const res = await fetch('/api/weight/latest');
		if (res.ok) {
			const data = await res.json();
			latestWeight = data.entry ?? null;
		}
	} catch {
		// silently ignore
	}
};

// In the template, gated by:
// {#if userPrefs?.showWeightWidget && latestWeight}
```

### Navigation Entry

```typescript
// Add to src/lib/config/navigation.ts
import Weight from '@lucide/svelte/icons/weight';
// Insert before Goals:
{ title: () => m.nav_weight(), href: '/app/weight', icon: Weight },
```

## State of the Art

| Old Approach          | Current Approach                 | When Changed        | Impact                                                                   |
| --------------------- | -------------------------------- | ------------------- | ------------------------------------------------------------------------ |
| layerchart 1.x        | layerchart 2.0.0-next.43         | Current             | Uses simplified chart API (LineChart, AreaChart as top-level components) |
| Client-side smoothing | Server-side SQL window functions | N/A (design choice) | Better performance, single source of truth                               |

## Open Questions

1. **Multiple entries per day display**
   - What we know: Users can log multiple times per day. Chart should show one point per day (latest). History list should show all entries.
   - What's unclear: Should the log form default to "now" or allow picking a past date/time?
   - Recommendation: Default to today's date and current time. Allow editing the date for backdating. No time picker needed (loggedAt is auto-set to `new Date()` on server).

2. **Weight decimal precision**
   - What we know: PostgreSQL `real` stores ~6 significant digits. Weight in kg typically has 1 decimal (e.g., 78.5).
   - What's unclear: Should UI restrict to 1 decimal place?
   - Recommendation: Accept up to 1 decimal in the UI (step="0.1" on input), store full precision in DB.

3. **"All" time range performance**
   - What we know: A user logging daily for years could have 1000+ entries.
   - What's unclear: Whether layerchart handles this smoothly.
   - Recommendation: The "all" range should be fine -- layerchart renders SVG lines which handle thousands of points well. If needed, downsample on the server for very large datasets, but premature optimization for now.

## Sources

### Primary (HIGH confidence)

- Codebase analysis: `src/lib/server/schema.ts` -- existing table patterns, column types, index conventions
- Codebase analysis: `src/lib/server/supplements.ts` -- Result pattern, CRUD operations, Zod validation flow
- Codebase analysis: `src/lib/components/charts/CalorieTrendChart.svelte` -- layerchart AreaChart usage, series/tooltip/axis config
- Codebase analysis: `src/lib/components/charts/ChartRangeSelector.svelte` -- range selection UI pattern
- Codebase analysis: `src/routes/app/+page.svelte` -- dashboard widget integration, preference gating
- Codebase analysis: `src/lib/server/preferences.ts` -- showWeightWidget already in DEFAULT_PREFERENCES
- Package analysis: `node_modules/layerchart/dist/components/charts/LineChart.svelte.d.ts` -- LineChart props, series support
- Package analysis: `node_modules/layerchart/dist/components/charts/types.d.ts` -- SeriesData type, seriesLayout options

### Secondary (MEDIUM confidence)

- PostgreSQL window functions -- well-documented standard SQL feature, `ROWS BETWEEN N PRECEDING AND CURRENT ROW` is standard
- Drizzle ORM `sql` template literal -- verified in codebase (`favorites.ts`, `schema.ts`) for raw SQL escape hatch

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - zero new dependencies, all patterns verified in codebase
- Architecture: HIGH - direct analog exists (supplements module), all file locations follow conventions
- Pitfalls: HIGH - UTC drift addressed by prior decision, moving average approach verified with SQL standards
- Chart integration: MEDIUM - layerchart LineChart multi-series not yet used in this project (only AreaChart and BarChart are), but API is consistent

**Research date:** 2026-02-19
**Valid until:** 2026-03-19 (stable -- no fast-moving dependencies)
