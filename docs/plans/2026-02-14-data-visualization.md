# Data Visualization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add stats charts, color-coded calendar days, and goal progress display on history detail pages.

**Architecture:** Use `layerchart` (already in dependencies) for bar charts. Extend the Calendar component with colored day indicators. Reuse the GoalProgress components (CalorieRing + MacroProgressBars) from the navigation-ux plan on the history detail page.

**Tech Stack:** SvelteKit, Svelte 5 runes, layerchart, Tailwind CSS

**Dependency:** Requires Task 2-3 from `2026-02-14-navigation-ux-polish.md` (CalorieRing + MacroProgressBars components).

---

### Task 1: Daily Calories Bar Chart

**Files:**
- Create: `src/lib/components/stats/CaloriesChart.svelte`
- Reference: `layerchart` docs for bar chart API

**Step 1: Create CaloriesChart component**

A bar chart showing daily calorie totals over a configurable period with a horizontal goal line.

Props:
- `data`: array of `{ date: string, calories: number }`
- `goal`: number (calorie goal, 0 if not set)

Use `layerchart` Bar + Axis components. The goal line is a horizontal Rule/threshold line overlay.

Each bar colored blue (matching the app's calorie color). Bars exceeding goal colored with destructive/red tint.

**Step 2: Run type check**

Run: `bun run check`
Expected: 0 errors

**Step 3: Commit**

```
feat: add daily calories bar chart component
```

---

### Task 2: Integrate Charts into History Page

**Files:**
- Modify: `src/routes/app/history/+page.svelte`
- Modify: `src/routes/api/stats/weekly/+server.ts` (may need to return daily breakdown)
- Modify: `src/routes/api/stats/monthly/+server.ts` (may need to return daily breakdown)
- Reference: `src/lib/server/stats.ts`

**Step 1: Check stats API response format**

Read `src/lib/server/stats.ts` to understand what the weekly/monthly endpoints return. If they only return averages (not daily breakdowns), modify to also return the daily data array needed for the chart.

**Step 2: Add chart to history page**

Import `CaloriesChart`. Fetch goals from `/api/goals`. Pass the daily stats data and calorie goal to the chart.

Add a tab/toggle for "Weekly" vs "Monthly" view above the chart. Display the corresponding text averages below the chart (already exists).

**Step 3: Verify**

- Navigate to `/app/history`
- Chart should show daily calorie bars
- Goal line should appear if goals are set
- Toggle between weekly/monthly views

**Step 4: Run type check**

Run: `bun run check`
Expected: 0 errors

**Step 5: Commit**

```
feat: integrate calorie charts into history page
```

---

### Task 3: Color-Coded Calendar Days

**Files:**
- Modify: `src/lib/components/history/Calendar.svelte`
- Modify: `src/routes/app/history/+page.svelte`
- Reference: `src/routes/api/entries/+server.ts` (range endpoint)

**Step 1: Fetch monthly entry data for calendar**

In the history page, fetch entries for the displayed month using `GET /api/entries/range?start=YYYY-MM-01&end=YYYY-MM-31`. Also fetch goals. Calculate daily calorie totals and compare to goal.

Build a `dayColors` map: `Record<string, 'green' | 'red' | 'gray'>`:
- Green: within 10% of goal (0.9x to 1.1x)
- Red: over goal by >10%
- Gray: under goal by >10%
- No entry in map: no entries logged that day

**Step 2: Add color indicators to Calendar component**

The Calendar component already accepts a `dayColors` prop. Add a small colored dot below each day number based on the `dayColors` map.

```svelte
{#if dayColors[dateStr]}
	<span class="mt-0.5 h-1.5 w-1.5 rounded-full {
		dayColors[dateStr] === 'green' ? 'bg-green-500' :
		dayColors[dateStr] === 'red' ? 'bg-red-500' :
		'bg-gray-400'
	}"></span>
{/if}
```

**Step 3: Reload colors on month navigation**

When the user navigates to a different month, re-fetch entries for that month and recalculate colors.

**Step 4: Verify**

- Log some entries for various days
- Set goals
- Navigate to history — dots should appear
- Green for days near goal, red for over, gray for under

**Step 5: Run type check**

Run: `bun run check`
Expected: 0 errors

**Step 6: Commit**

```
feat: add color-coded goal indicators to calendar
```

---

### Task 4: Goal Progress on History Detail Page

**Files:**
- Modify: `src/routes/app/history/[date]/+page.svelte`

**Step 1: Add goal progress to history detail**

Import `CalorieRing` and `MacroProgressBars` from `$lib/components/goals/`. Fetch goals from `/api/goals`. Calculate daily totals from the entries (already done). Display the calorie ring and macro bars above the meal sections, same layout as dashboard.

**Step 2: Verify**

- Click a day in the calendar
- Goal progress should show for that historical day
- Ring and bars should reflect that day's totals vs goals

**Step 3: Run type check**

Run: `bun run check`
Expected: 0 errors

**Step 4: Commit**

```
feat: show goal progress on history detail page
```
