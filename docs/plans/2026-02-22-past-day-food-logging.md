# Past-Day Food Logging Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to add and edit food entries for any past day, via date navigation on the dashboard and full editing on the history detail page.

**Architecture:** Extract all entry CRUD logic from the dashboard into a new `DayLog.svelte` component parameterised by `date`. The dashboard gains prev/next date navigation with client state. The history detail page drops its read-only view and uses `DayLog` instead.

**Tech Stack:** Svelte 5 runes, SvelteKit, Bun, Tailwind CSS, shadcn-svelte, Paraglide i18n (en + de)

---

### Task 1: Add i18n keys

**Files:**

- Modify: `messages/en.json`
- Modify: `messages/de.json`

No new API — purely adding message strings.

**Step 1: Add keys to en.json**

Find the block after `"dashboard_kcal"` (line ~19) and insert:

```json
  "dashboard_previous_day": "Previous day",
  "dashboard_next_day": "Next day",
  "dashboard_yesterday": "Yesterday",
```

**Step 2: Add keys to de.json**

Same location after `"dashboard_kcal"`:

```json
  "dashboard_previous_day": "Vorheriger Tag",
  "dashboard_next_day": "Nächster Tag",
  "dashboard_yesterday": "Gestern",
```

**Step 3: Verify Paraglide compiles**

```bash
bun run dev
```

Expected: dev server starts without errors. Paraglide generates the new message functions into `src/lib/paraglide/messages/`. Stop the server once it's up.

**Step 4: Commit**

```bash
git add messages/en.json messages/de.json
git commit -m "feat: add i18n keys for past-day navigation"
```

---

### Task 2: Create `DayLog.svelte`

**Files:**

- Create: `src/lib/components/entries/DayLog.svelte`

This component owns all entry CRUD for a given `date`. It is extracted from the dashboard — copy the logic, adapt for a prop-driven date.

**Step 1: Create the component**

Create `src/lib/components/entries/DayLog.svelte` with this content:

```svelte
<script lang="ts">
	import MealSection from '$lib/components/entries/MealSection.svelte';
	import AddFoodModal from '$lib/components/entries/AddFoodModal.svelte';
	import EditEntryModal from '$lib/components/entries/EditEntryModal.svelte';
	import BarcodeScanModal from '$lib/components/barcode/BarcodeScanModal.svelte';
	import MacroSummary from '$lib/components/MacroSummary.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { calculateDailyTotals } from '$lib/utils/nutrition';
	import { DEFAULT_MEAL_TYPES } from '$lib/utils/meals';
	import { goto } from '$app/navigation';
	import { apiFetch } from '$lib/utils/api';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		date: string;
		onMutation?: () => void;
	};

	let { date, onMutation }: Props = $props();

	let foods: Array<any> = $state([]);
	let recipes: Array<any> = $state([]);
	let entries: Array<any> = $state([]);
	let addModalOpen = $state(false);
	let editModalOpen = $state(false);
	let scanModalOpen = $state(false);
	let activeMeal = $state('Breakfast');
	let editingEntry: { id: string; servings: number; mealType: string; foodName?: string } | null =
		$state(null);
	let scannedFood: any = $state(null);
	let scannedBarcode = $state('');

	const loadData = async () => {
		const [foodsRes, recipesRes, entriesRes] = await Promise.all([
			fetch('/api/foods'),
			fetch('/api/recipes'),
			fetch(`/api/entries?date=${date}`)
		]);
		foods = (await foodsRes.json()).foods;
		recipes = (await recipesRes.json()).recipes;
		entries = (await entriesRes.json()).entries;
	};

	const addEntry = async (payload: any) => {
		await apiFetch('/api/entries', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ ...payload, date })
		});
		addModalOpen = false;
		scannedFood = null;
		await loadData();
		onMutation?.();
	};

	const updateEntry = async (payload: { id: string; servings: number; mealType: string }) => {
		await apiFetch(`/api/entries/${payload.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ servings: payload.servings, mealType: payload.mealType })
		});
		editModalOpen = false;
		editingEntry = null;
		await loadData();
		onMutation?.();
	};

	const deleteEntry = async (id: string) => {
		await apiFetch(`/api/entries/${id}`, { method: 'DELETE' });
		editModalOpen = false;
		editingEntry = null;
		await loadData();
		onMutation?.();
	};

	const openEditModal = (entry: {
		id: string;
		servings: number;
		mealType: string;
		foodName?: string;
	}) => {
		editingEntry = entry;
		editModalOpen = true;
	};

	const handleBarcodeScan = async (barcode: string) => {
		const res = await fetch(`/api/foods?barcode=${encodeURIComponent(barcode)}`);
		const data = await res.json();
		if (data.food) {
			scannedFood = data.food;
			scannedBarcode = barcode;
			addModalOpen = true;
		} else {
			goto(`/foods/new?barcode=${encodeURIComponent(barcode)}`);
		}
	};

	const totals = $derived(calculateDailyTotals(entries));

	$effect(() => {
		if (date) loadData();
	});
</script>

<div class="space-y-4">
	<div class="flex justify-end">
		<Button variant="outline" size="sm" onclick={() => (scanModalOpen = true)}>
			{m.dashboard_scan()}
		</Button>
	</div>

	<div class="grid gap-4">
		{#each DEFAULT_MEAL_TYPES as mealType}
			<MealSection
				title={mealType}
				entries={entries.filter((e) => e.mealType === mealType)}
				onAdd={() => {
					addModalOpen = true;
					activeMeal = mealType;
				}}
				onEdit={openEditModal}
			/>
		{/each}
	</div>

	<div class="rounded border p-4">
		<MacroSummary {totals} round gridClass="grid-cols-2 md:grid-cols-5" />
	</div>

	<AddFoodModal
		open={addModalOpen}
		{foods}
		{recipes}
		mealType={activeMeal}
		onClose={() => {
			addModalOpen = false;
			scannedFood = null;
		}}
		onSave={addEntry}
	/>
	<EditEntryModal
		open={editModalOpen}
		entry={editingEntry}
		onClose={() => {
			editModalOpen = false;
			editingEntry = null;
		}}
		onSave={updateEntry}
		onDelete={deleteEntry}
	/>
	<BarcodeScanModal
		open={scanModalOpen}
		onClose={() => (scanModalOpen = false)}
		onBarcode={handleBarcodeScan}
	/>
</div>
```

**Step 2: Type-check**

```bash
bun run check
```

Expected: no errors. Fix any type errors before proceeding.

**Step 3: Commit**

```bash
git add src/lib/components/entries/DayLog.svelte
git commit -m "feat: add DayLog component for date-aware entry CRUD"
```

---

### Task 3: Update history detail page

**Files:**

- Modify: `src/routes/(app)/history/[date]/+page.svelte`

Replace the read-only meal section grid and standalone `MacroSummary` with `<DayLog>`. Keep the page header (date + back button).

**Step 1: Replace the page content**

Replace the entire file with:

```svelte
<script lang="ts">
	import { page } from '$app/stores';
	import DayLog from '$lib/components/entries/DayLog.svelte';
	import * as m from '$lib/paraglide/messages';

	const date = $derived($page.params.date);
</script>

<div class="mx-auto max-w-4xl space-y-6">
	<div class="flex items-center justify-between">
		<h2 class="text-2xl font-semibold">{date}</h2>
		<a href="/history" class="rounded border px-3 py-1 text-sm">{m.history_back()}</a>
	</div>

	<DayLog {date} />
</div>
```

**Step 2: Type-check**

```bash
bun run check
```

Expected: no errors.

**Step 3: Verify manually**

Start the dev server (`bun run dev`), navigate to `/history`, click any day that has entries. Confirm:

- Entries are shown (not blank)
- "Add Food" buttons appear in each meal section
- You can add a new entry and it saves
- You can edit/delete an existing entry
- Macro summary shows at the bottom

**Step 4: Commit**

```bash
git add src/routes/\(app\)/history/\[date\]/+page.svelte
git commit -m "feat: make history detail page editable via DayLog"
```

---

### Task 4: Update dashboard with date navigation

**Files:**

- Modify: `src/routes/(app)/+page.svelte`

Add `activeDate` state (starts as today), prev/next arrows in the header, hide today-only widgets when on a past day, and replace the inline entry CRUD with `<DayLog>`.

**Step 1: Replace the dashboard**

Replace the entire file with:

```svelte
<script lang="ts">
	import DayLog from '$lib/components/entries/DayLog.svelte';
	import CalorieTrendChart from '$lib/components/charts/CalorieTrendChart.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { type MacroTotals } from '$lib/utils/nutrition';
	import { today, yesterday, daysAgo, shiftDate } from '$lib/utils/dates';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/utils/api';
	import SupplementChecklist from '$lib/components/supplements/SupplementChecklist.svelte';
	import FavoritesWidget from '$lib/components/favorites/FavoritesWidget.svelte';
	import WeightWidget from '$lib/components/weight/WeightWidget.svelte';
	import * as m from '$lib/paraglide/messages';

	let activeDate = $state(today());
	let copying = $state(false);
	let weeklyData: Array<{ date: string } & MacroTotals> = $state([]);
	let weeklyCalorieGoal: number | undefined = $state(undefined);
	type ChecklistItem = {
		supplement: {
			id: string;
			name: string;
			dosage: number;
			dosageUnit: string;
			timeOfDay: string | null;
		};
		taken: boolean;
		takenAt: string | null;
	};
	let supplementChecklist: ChecklistItem[] = $state([]);
	let latestWeight: { weightKg: number; entryDate: string } | null = $state(null);
	let userPrefs: Record<string, any> | null = $state(null);
	let ready = $state(false);

	const isToday = $derived(activeDate === today());

	const dateLabel = $derived(
		activeDate === today()
			? m.dashboard_today()
			: activeDate === yesterday()
				? m.dashboard_yesterday()
				: activeDate
	);

	const prevDay = () => {
		activeDate = shiftDate(activeDate, -1);
	};

	const nextDay = () => {
		if (!isToday) activeDate = shiftDate(activeDate, 1);
	};

	const copyYesterday = async () => {
		copying = true;
		try {
			await apiFetch(`/api/entries/copy?fromDate=${yesterday()}&toDate=${today()}`, {
				method: 'POST'
			});
			await loadWeeklyChart();
		} finally {
			copying = false;
		}
	};

	const loadWeeklyChart = async () => {
		try {
			const res = await fetch(`/api/stats/daily?startDate=${daysAgo(7)}&endDate=${today()}`);
			if (!res.ok) return;
			const json = await res.json();
			weeklyData = json.data ?? [];
			weeklyCalorieGoal = json.goals?.calorieGoal ?? undefined;
		} catch {
			// silently ignore chart load failures
		}
	};

	const loadLatestWeight = async () => {
		try {
			const res = await fetch('/api/weight/latest');
			if (res.ok) {
				const data = await res.json();
				latestWeight = data.entry;
			}
		} catch {
			// silently ignore
		}
	};

	const loadSupplements = async () => {
		try {
			const res = await fetch('/api/supplements/today');
			if (res.ok) {
				supplementChecklist = (await res.json()).checklist;
			}
		} catch {
			// silently ignore
		}
	};

	const toggleSupplement = async (supplementId: string, taken: boolean) => {
		if (taken) {
			await apiFetch(`/api/supplements/${supplementId}/log`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: '{}'
			});
		} else {
			const currentDate = today();
			await apiFetch(`/api/supplements/${supplementId}/log/${currentDate}`, { method: 'DELETE' });
		}
		await loadSupplements();
	};

	const checkStartPage = async () => {
		try {
			const res = await fetch('/api/preferences');
			if (res.ok) {
				const { preferences } = await res.json();
				userPrefs = preferences;
				if (preferences.startPage === 'favorites') {
					goto('/favorites', { replaceState: true });
					return;
				}
			}
		} catch {
			// Silently ignore -- show dashboard as fallback
		}
		ready = true;

		loadWeeklyChart();
		loadSupplements();
		loadLatestWeight();
	};

	onMount(() => {
		checkStartPage();
	});
</script>

{#if ready}
	<div class="mx-auto max-w-4xl space-y-6">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<div class="flex items-center gap-2">
				<Button
					variant="ghost"
					size="icon"
					onclick={prevDay}
					aria-label={m.dashboard_previous_day()}
				>
					←
				</Button>
				<h2 class="text-2xl font-semibold">{dateLabel}</h2>
				<Button
					variant="ghost"
					size="icon"
					onclick={nextDay}
					disabled={isToday}
					aria-label={m.dashboard_next_day()}
				>
					→
				</Button>
			</div>
			{#if isToday}
				<Button variant="outline" size="sm" onclick={copyYesterday} disabled={copying}>
					{copying ? m.dashboard_copying() : m.dashboard_copy_yesterday()}
				</Button>
			{/if}
		</div>

		{#if weeklyData.length > 0}
			<Card.Root>
				<Card.Header class="pb-2">
					<Card.Title class="text-base">{m.charts_this_week()}</Card.Title>
				</Card.Header>
				<Card.Content>
					<div class="h-[200px]">
						<CalorieTrendChart data={weeklyData} calorieGoal={weeklyCalorieGoal} />
					</div>
				</Card.Content>
			</Card.Root>
		{/if}

		{#if isToday}
			{#each userPrefs?.widgetOrder ?? ['favorites', 'supplements', 'weight'] as widgetKey (widgetKey)}
				{#if widgetKey === 'favorites' && userPrefs?.showFavoritesWidget}
					<FavoritesWidget
						onEntryLogged={() => {}}
						favoriteTapAction={userPrefs?.favoriteTapAction ?? 'instant'}
					/>
				{:else if widgetKey === 'supplements' && userPrefs?.showSupplementsWidget}
					<SupplementChecklist checklist={supplementChecklist} onToggle={toggleSupplement} />
				{:else if widgetKey === 'weight' && userPrefs?.showWeightWidget}
					<WeightWidget
						weightKg={latestWeight?.weightKg ?? null}
						entryDate={latestWeight?.entryDate ?? null}
					/>
				{/if}
			{/each}
		{/if}

		<DayLog date={activeDate} onMutation={loadWeeklyChart} />
	</div>
{/if}
```

**Step 2: Type-check**

```bash
bun run check
```

Expected: no errors. Fix any type errors before continuing.

**Step 3: Verify manually**

Start `bun run dev` and check:

- Dashboard loads with "Today" heading and ← → arrows
- → arrow is disabled when on today
- Clicking ← shows "Yesterday" (or the date), entries for that day load
- Clicking ← again goes back further; → re-enables and goes forward
- When on a past day: supplements, favorites, weight widgets are hidden; "Copy Yesterday" button is hidden
- When back on today: all widgets reappear
- Adding/editing/deleting an entry on a past day works and the weekly chart refreshes

**Step 4: Commit**

```bash
git add src/routes/\(app\)/+page.svelte
git commit -m "feat: add date navigation to dashboard for past-day logging"
```

---

## Done

All four tasks complete. The weekly chart will reflect any backdated entries immediately. No API changes, no schema changes, no migrations needed.
