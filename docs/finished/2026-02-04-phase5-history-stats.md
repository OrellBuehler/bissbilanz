# Phase 5: History & Stats - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Provide a history calendar, date navigation, and weekly/monthly macro averages.

**Architecture:** Add stats utilities in `src/lib/utils/stats.ts`, create range/stat API endpoints, and build a history page that reuses existing entry rendering in read-only mode.

**Tech Stack:** SvelteKit 2.x, Svelte 5, Bun, Drizzle ORM, PostgreSQL, shadcn-svelte, Tailwind CSS 4.x

---

## Task 1: Stats Utilities

**Files:**
- Create: `src/lib/utils/stats.ts`
- Create: `tests/utils/stats.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { averageTotals } from '../../src/lib/utils/stats';

describe('averageTotals', () => {
	test('averages totals across days', () => {
		const avg = averageTotals([
			{ calories: 2000, protein: 100, carbs: 250, fat: 60, fiber: 30 },
			{ calories: 1800, protein: 90, carbs: 220, fat: 50, fiber: 25 }
		]);
		expect(avg.calories).toBe(1900);
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/utils/stats.test.ts`
Expected: FAIL with “Cannot find module …/stats”

**Step 3: Write minimal implementation**

Create `src/lib/utils/stats.ts`:
```ts
import type { MacroTotals } from '$lib/utils/nutrition';

export const averageTotals = (days: MacroTotals[]) => {
	if (!days.length) return { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
	const sum = days.reduce(
		(acc, day) => ({
			calories: acc.calories + day.calories,
			protein: acc.protein + day.protein,
			carbs: acc.carbs + day.carbs,
			fat: acc.fat + day.fat,
			fiber: acc.fiber + day.fiber
		}),
		{ calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
	);
	return {
		calories: sum.calories / days.length,
		protein: sum.protein / days.length,
		carbs: sum.carbs / days.length,
		fat: sum.fat / days.length,
		fiber: sum.fiber / days.length
	};
};
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/utils/stats.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/utils/stats.ts tests/utils/stats.test.ts
git commit -m "feat: add stats utilities"
```

---

## Task 2: Entries Range + Stats API

**Files:**
- Create: `src/routes/api/entries/range/+server.ts`
- Create: `src/routes/api/stats/weekly/+server.ts`
- Create: `src/routes/api/stats/monthly/+server.ts`
- Modify: `src/lib/server/entries.ts`
- Create: `src/lib/utils/date-range.ts`
- Create: `tests/utils/date-range.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { toDateRange } from '../../src/lib/utils/date-range';

describe('toDateRange', () => {
	test('builds a range for 7 days', () => {
		const { startDate, endDate } = toDateRange('2026-02-03', 7);
		expect(startDate).toBe('2026-01-28');
		expect(endDate).toBe('2026-02-03');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/utils/date-range.test.ts`
Expected: FAIL with “Cannot find module …/date-range”

**Step 3: Write minimal implementation**

Create `src/lib/utils/date-range.ts`:
```ts
import { shiftDate } from '$lib/utils/dates';

export const toDateRange = (endDate: string, days: number) => ({
	startDate: shiftDate(endDate, -(days - 1)),
	endDate
});
```

Update `src/lib/server/entries.ts`:
```ts
import { between } from 'drizzle-orm';

export const listEntriesByRange = async (userId: string, startDate: string, endDate: string) => {
	return db
		.select()
		.from(foodEntries)
		.where(and(eq(foodEntries.userId, userId), between(foodEntries.date, startDate, endDate)));
};
```

Create `src/routes/api/entries/range/+server.ts`:
```ts
import { json } from '@sveltejs/kit';
import { listEntriesByRange } from '$lib/server/entries';

export const GET = async ({ locals, url }) => {
	const startDate = url.searchParams.get('startDate');
	const endDate = url.searchParams.get('endDate');
	if (!startDate || !endDate) return json({ error: 'Missing dates' }, { status: 400 });
	const entries = await listEntriesByRange(locals.user.id, startDate, endDate);
	return json({ entries });
};
```

Create `src/routes/api/stats/weekly/+server.ts`:
```ts
import { json } from '@sveltejs/kit';
import { listEntriesByRange } from '$lib/server/entries';
import { calculateDailyTotals } from '$lib/utils/nutrition';
import { averageTotals } from '$lib/utils/stats';
import { toDateRange } from '$lib/utils/date-range';

export const GET = async ({ locals, url }) => {
	const endDate = url.searchParams.get('endDate') ?? new Date().toISOString().slice(0, 10);
	const { startDate } = toDateRange(endDate, 7);
	const entries = await listEntriesByRange(locals.user.id, startDate, endDate);
	const dailyTotals = [calculateDailyTotals(entries as any[])];
	return json({ averages: averageTotals(dailyTotals) });
};
```

Create `src/routes/api/stats/monthly/+server.ts`:
```ts
import { json } from '@sveltejs/kit';
import { listEntriesByRange } from '$lib/server/entries';
import { calculateDailyTotals } from '$lib/utils/nutrition';
import { averageTotals } from '$lib/utils/stats';
import { toDateRange } from '$lib/utils/date-range';

export const GET = async ({ locals, url }) => {
	const endDate = url.searchParams.get('endDate') ?? new Date().toISOString().slice(0, 10);
	const { startDate } = toDateRange(endDate, 30);
	const entries = await listEntriesByRange(locals.user.id, startDate, endDate);
	const dailyTotals = [calculateDailyTotals(entries as any[])];
	return json({ averages: averageTotals(dailyTotals) });
};
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/utils/date-range.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/utils/date-range.ts src/lib/server/entries.ts src/routes/api/entries/range src/routes/api/stats tests/utils/date-range.test.ts
git commit -m "feat: add range and stats APIs"
```

---

## Task 3: History Calendar UI

**Files:**
- Create: `src/lib/components/history/HistoryCalendar.svelte`
- Create: `src/routes/app/history/+page.svelte`
- Create: `tests/utils/history.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { toCalendarDays } from '../../src/lib/utils/history';

describe('toCalendarDays', () => {
	test('builds calendar days for month', () => {
		const days = toCalendarDays('2026-02-03');
		expect(days.length).toBeGreaterThan(27);
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/utils/history.test.ts`
Expected: FAIL with “Cannot find module …/history”

**Step 3: Write minimal implementation**

Create `src/lib/utils/history.ts`:
```ts
export const toCalendarDays = (isoDate: string) => {
	const date = new Date(isoDate + 'T00:00:00Z');
	const year = date.getUTCFullYear();
	const month = date.getUTCMonth();
	const start = new Date(Date.UTC(year, month, 1));
	const end = new Date(Date.UTC(year, month + 1, 0));
	const days: string[] = [];
	for (let d = start; d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
		days.push(d.toISOString().slice(0, 10));
	}
	return days;
};
```

Create `src/lib/components/history/HistoryCalendar.svelte`:
```svelte
<script lang="ts">
	import { toCalendarDays } from '$lib/utils/history';
	export let activeDate = new Date().toISOString().slice(0, 10);
	export let onSelect: (date: string) => void;

	$: days = toCalendarDays(activeDate);
</script>

<div class="grid grid-cols-7 gap-2">
	{#each days as day}
		<button
			class={`rounded border p-2 text-sm ${day === activeDate ? 'bg-black text-white' : ''}`}
			on:click={() => onSelect(day)}
		>
			{day.slice(-2)}
		</button>
	{/each}
</div>
```

Create `src/routes/app/history/+page.svelte`:
```svelte
<script lang="ts">
	import HistoryCalendar from '$lib/components/history/HistoryCalendar.svelte';
	let activeDate = new Date().toISOString().slice(0, 10);

	const onSelect = (date: string) => {
		activeDate = date;
	};
</script>

<div class="mx-auto max-w-4xl space-y-6 p-6">
	<h1 class="text-2xl font-semibold">History</h1>
	<HistoryCalendar {activeDate} {onSelect} />
</div>
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/utils/history.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/utils/history.ts src/lib/components/history src/routes/app/history/+page.svelte tests/utils/history.test.ts
git commit -m "feat: add history calendar"
```

---

## Task 4: Read-Only Daily Log View

**Files:**
- Modify: `src/routes/app/+page.svelte`
- Modify: `src/routes/app/history/+page.svelte`
- Create: `src/lib/utils/history-view.ts`
- Create: `tests/utils/history-view.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { isReadOnlyDate } from '../../src/lib/utils/history-view';

describe('isReadOnlyDate', () => {
	test('returns true for past dates', () => {
		expect(isReadOnlyDate('2026-02-01', '2026-02-03')).toBe(true);
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/utils/history-view.test.ts`
Expected: FAIL with “Cannot find module …/history-view”

**Step 3: Write minimal implementation**

Create `src/lib/utils/history-view.ts`:
```ts
export const isReadOnlyDate = (activeDate: string, today: string) => activeDate !== today;
```

Modify `src/routes/app/+page.svelte` to accept a `date` query param and avoid allowing edits when read-only.

Modify `src/routes/app/history/+page.svelte` to navigate to `/app?date=YYYY-MM-DD` when a calendar date is selected.

**Step 4: Run test to verify it passes**

Run: `bun test tests/utils/history-view.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/utils/history-view.ts src/routes/app/+page.svelte src/routes/app/history/+page.svelte tests/utils/history-view.test.ts
git commit -m "feat: add read-only history view"
```

---

## Task 5: Stats Panel UI

**Files:**
- Create: `src/lib/components/history/StatsPanel.svelte`
- Modify: `src/routes/app/history/+page.svelte`
- Create: `src/lib/utils/stats-format.ts`
- Create: `tests/utils/stats-format.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { formatMacro } from '../../src/lib/utils/stats-format';

describe('formatMacro', () => {
	test('formats macro values', () => {
		expect(formatMacro(150, 'g')).toBe('150 g');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/utils/stats-format.test.ts`
Expected: FAIL with “Cannot find module …/stats-format”

**Step 3: Write minimal implementation**

Create `src/lib/utils/stats-format.ts`:
```ts
export const formatMacro = (value: number, unit: string) => `${Math.round(value)} ${unit}`;
```

Create `src/lib/components/history/StatsPanel.svelte`:
```svelte
<script lang="ts">
	export let weekly: any;
	export let monthly: any;
</script>

<div class="grid gap-4 md:grid-cols-2">
	<div class="rounded border p-4">
		<h3 class="font-medium">Weekly average</h3>
		<div class="mt-2 text-sm">Calories: {Math.round(weekly?.calories ?? 0)}</div>
	</div>
	<div class="rounded border p-4">
		<h3 class="font-medium">Monthly average</h3>
		<div class="mt-2 text-sm">Calories: {Math.round(monthly?.calories ?? 0)}</div>
	</div>
</div>
```

Modify `src/routes/app/history/+page.svelte` to load `/api/stats/weekly` and `/api/stats/monthly`, then render `StatsPanel`.

**Step 4: Run test to verify it passes**

Run: `bun test tests/utils/stats-format.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/utils/stats-format.ts src/lib/components/history/StatsPanel.svelte src/routes/app/history/+page.svelte tests/utils/stats-format.test.ts
git commit -m "feat: add stats panel"
```
