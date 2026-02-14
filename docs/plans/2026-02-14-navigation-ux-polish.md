# Navigation & UX Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add bottom tab navigation, goal progress display on dashboard, custom meal type integration, and food/recipe editing.

**Architecture:** Add a shared BottomNav component to the app layout. Create a reusable GoalProgress component (calorie ring + macro bars) used on both dashboard and history detail. Wire custom meal types into dashboard and AddFoodModal. Enable food/recipe editing by reusing existing forms in edit mode.

**Tech Stack:** SvelteKit, Svelte 5 runes, shadcn-svelte, Tailwind CSS, @lucide/svelte

---

### Task 1: Bottom Tab Navigation

**Files:**
- Create: `src/lib/components/navigation/BottomNav.svelte`
- Modify: `src/routes/app/+layout.svelte`

**Step 1: Create BottomNav component**

```svelte
<script lang="ts">
	import { page } from '$app/state';
	import { Home, Apple, ChefHat, Calendar, Settings } from '@lucide/svelte';

	const tabs = [
		{ href: '/app', label: 'Dashboard', icon: Home },
		{ href: '/app/foods', label: 'Foods', icon: Apple },
		{ href: '/app/recipes', label: 'Recipes', icon: ChefHat },
		{ href: '/app/history', label: 'History', icon: Calendar },
		{ href: '/app/settings', label: 'Settings', icon: Settings }
	] as const;

	function isActive(href: string): boolean {
		if (href === '/app') return page.url.pathname === '/app';
		return page.url.pathname.startsWith(href);
	}
</script>

<nav class="fixed bottom-0 left-0 right-0 z-50 border-t bg-background">
	<div class="mx-auto flex max-w-lg justify-around">
		{#each tabs as tab}
			<a
				href={tab.href}
				class="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors {isActive(tab.href) ? 'text-primary' : 'text-muted-foreground'}"
			>
				<tab.icon class="h-5 w-5" />
				<span>{tab.label}</span>
			</a>
		{/each}
	</div>
</nav>
```

**Step 2: Add BottomNav to app layout**

In `src/routes/app/+layout.svelte`, import and add the BottomNav below the main content. Add `pb-16` padding to the main content area so it doesn't overlap with the fixed bottom nav.

**Step 3: Verify navigation works**

Run: `bun run dev`
- Visit `/app` — Dashboard tab should be highlighted
- Click each tab — should navigate and highlight correctly
- Content should not be hidden behind the nav bar

**Step 4: Run type check**

Run: `bun run check`
Expected: 0 errors

**Step 5: Commit**

```
feat: add bottom tab navigation
```

---

### Task 2: Goal Progress Component — Calorie Ring

**Files:**
- Create: `src/lib/components/goals/CalorieRing.svelte`

**Step 1: Create CalorieRing component**

SVG-based circular progress ring showing consumed vs goal calories.

```svelte
<script lang="ts">
	import type { MacroTotals } from '$lib/utils/nutrition';

	interface Props {
		current: number;
		goal: number;
	}

	let { current, goal }: Props = $props();

	const radius = 45;
	const circumference = 2 * Math.PI * radius;

	let progress = $derived(goal > 0 ? Math.min(current / goal, 1.5) : 0);
	let offset = $derived(circumference - progress * circumference);
	let isOver = $derived(current > goal && goal > 0);
	let remaining = $derived(Math.max(goal - current, 0));
</script>

<div class="flex flex-col items-center">
	<div class="relative h-32 w-32">
		<svg class="h-full w-full -rotate-90" viewBox="0 0 100 100">
			<circle cx="50" cy="50" r={radius} fill="none" stroke="currentColor"
				stroke-width="8" class="text-muted" />
			<circle cx="50" cy="50" r={radius} fill="none"
				stroke-width="8" stroke-linecap="round"
				stroke-dasharray={circumference} stroke-dashoffset={offset}
				class="transition-all duration-500 {isOver ? 'text-destructive' : 'text-blue-500'}" />
		</svg>
		<div class="absolute inset-0 flex flex-col items-center justify-center">
			<span class="text-2xl font-bold">{Math.round(current)}</span>
			<span class="text-xs text-muted-foreground">/ {Math.round(goal)} kcal</span>
		</div>
	</div>
	{#if goal > 0}
		<p class="mt-1 text-sm text-muted-foreground">
			{isOver ? `${Math.round(current - goal)} over` : `${Math.round(remaining)} remaining`}
		</p>
	{/if}
</div>
```

**Step 2: Run type check**

Run: `bun run check`
Expected: 0 errors

**Step 3: Commit**

```
feat: add CalorieRing progress component
```

---

### Task 3: Goal Progress Component — Macro Bars

**Files:**
- Create: `src/lib/components/goals/MacroProgressBars.svelte`

**Step 1: Create MacroProgressBars component**

Horizontal progress bars for protein, carbs, fat, fiber with color coding.

```svelte
<script lang="ts">
	interface Props {
		protein: number;
		carbs: number;
		fat: number;
		fiber: number;
		proteinGoal: number;
		carbGoal: number;
		fatGoal: number;
		fiberGoal: number;
	}

	let { protein, carbs, fat, fiber, proteinGoal, carbGoal, fatGoal, fiberGoal }: Props = $props();

	const macros = $derived([
		{ label: 'Protein', current: protein, goal: proteinGoal, color: 'bg-red-500', track: 'bg-red-100' },
		{ label: 'Carbs', current: carbs, goal: carbGoal, color: 'bg-orange-500', track: 'bg-orange-100' },
		{ label: 'Fat', current: fat, goal: fatGoal, color: 'bg-yellow-500', track: 'bg-yellow-100' },
		{ label: 'Fiber', current: fiber, goal: fiberGoal, color: 'bg-green-500', track: 'bg-green-100' }
	]);
</script>

<div class="space-y-3">
	{#each macros as macro}
		{@const pct = macro.goal > 0 ? Math.min((macro.current / macro.goal) * 100, 100) : 0}
		{@const isOver = macro.current > macro.goal && macro.goal > 0}
		<div>
			<div class="flex justify-between text-sm">
				<span class="font-medium">{macro.label}</span>
				<span class="text-muted-foreground">
					{Math.round(macro.current)}
					{#if macro.goal > 0}/ {Math.round(macro.goal)}g{/if}
				</span>
			</div>
			<div class="mt-1 h-2 rounded-full {macro.track}">
				<div
					class="h-full rounded-full transition-all duration-500 {isOver ? 'bg-destructive' : macro.color}"
					style="width: {pct}%"
				></div>
			</div>
		</div>
	{/each}
</div>
```

**Step 2: Run type check**

Run: `bun run check`
Expected: 0 errors

**Step 3: Commit**

```
feat: add MacroProgressBars component
```

---

### Task 4: Integrate Goal Progress into Dashboard

**Files:**
- Modify: `src/routes/app/+page.svelte`

**Step 1: Fetch goals on dashboard load**

Add goals state and fetch from `/api/goals` in `loadData()`. Import `CalorieRing` and `MacroProgressBars`.

**Step 2: Add goal display to dashboard UI**

Insert above the meal sections:
- CalorieRing showing `totals.calories` vs `goals.calorieGoal`
- MacroProgressBars showing each macro current vs goal
- If no goals set, show a link to `/app/goals` with "Set your daily goals"

**Step 3: Verify on dev server**

Run: `bun run dev`
- Set goals on `/app/goals`
- Return to dashboard — ring and bars should reflect current totals vs goals
- Log a food entry — progress should update

**Step 4: Run type check**

Run: `bun run check`
Expected: 0 errors

**Step 5: Commit**

```
feat: display goal progress on dashboard
```

---

### Task 5: Custom Meal Types on Dashboard

**Files:**
- Modify: `src/routes/app/+page.svelte`
- Modify: `src/lib/components/entries/AddFoodModal.svelte`
- Reference: `src/lib/utils/meals.ts` (uses `DEFAULT_MEAL_TYPES` and `mergeMealTypes()`)

**Step 1: Fetch custom meal types in dashboard loadData()**

Add a fetch to `/api/meal-types` in `loadData()`. Use `mergeMealTypes()` from `$lib/utils/meals` to combine defaults with custom types.

**Step 2: Replace hardcoded meal sections**

Replace the four hardcoded MealSection instances with a loop over the merged meal types. Filter entries by `mealType` matching the type name.

**Step 3: Pass meal types to AddFoodModal**

Add a `mealTypes` prop to `AddFoodModal` so the meal type selector uses the merged list instead of hardcoded defaults. Update the meal type `<select>` in `EditEntryModal` similarly.

**Step 4: Verify on dev server**

- Create a custom meal type "Pre-Workout" in settings
- Return to dashboard — should show 5 sections
- Add a food to "Pre-Workout" — should work correctly

**Step 5: Run type check**

Run: `bun run check`
Expected: 0 errors

**Step 6: Commit**

```
feat: integrate custom meal types into dashboard
```

---

### Task 6: Food Editing

**Files:**
- Modify: `src/routes/app/foods/+page.svelte`
- Modify: `src/lib/components/foods/FoodForm.svelte` (already supports `initial` prop)

**Step 1: Add edit state and handler to foods page**

Add `editingFood` state. When edit is clicked on a food in the list, set `editingFood` to that food. Show the `FoodForm` with `initial={editingFood}`. On save, call `PATCH /api/foods/[id]` instead of POST.

**Step 2: Wire up onEdit in FoodList**

Replace the empty `onEdit={() => {}}` with the actual edit handler that sets `editingFood`.

**Step 3: Handle save in edit mode**

When `editingFood` is set, the save handler should PATCH instead of POST. After successful save, clear `editingFood` and reload the food list.

**Step 4: Verify**

- Create a food, then click edit
- Form should be pre-filled with existing data
- Change a field, save — should update
- Food list should reflect the change

**Step 5: Run type check**

Run: `bun run check`
Expected: 0 errors

**Step 6: Commit**

```
feat: add food editing support
```

---

### Task 7: Recipe Editing

**Files:**
- Modify: `src/routes/app/recipes/+page.svelte`
- Modify: `src/lib/components/recipes/RecipeForm.svelte` (add `initial` prop support)
- Reference: `src/routes/api/recipes/[id]/+server.ts` (PATCH already exists)

**Step 1: Add initial prop to RecipeForm**

Add an optional `initial` prop to `RecipeForm` (similar pattern to `FoodForm`). When provided, pre-fill the form state with the recipe name, totalServings, and ingredients.

**Step 2: Add edit state to recipes page**

Add `editingRecipe` state. Fetch full recipe data (with ingredients) from `GET /api/recipes/[id]` when edit is clicked. Show `RecipeForm` with `initial={editingRecipe}`.

**Step 3: Handle save in edit mode**

When editing, call `PATCH /api/recipes/[id]` instead of POST. After save, clear editing state and reload.

**Step 4: Add edit button to recipe list**

Add an edit button next to each recipe's delete button.

**Step 5: Verify**

- Create a recipe with 2 ingredients
- Click edit — form should show with existing data
- Change an ingredient, save — should update
- Recipe list should reflect the change

**Step 6: Run type check**

Run: `bun run check`
Expected: 0 errors

**Step 7: Commit**

```
feat: add recipe editing support
```

---

### Task 8: Fix Goals Page Data Loading

**Files:**
- Modify: `src/routes/app/goals/+page.svelte`

**Step 1: Load existing goals on mount**

Add a `loadGoals()` function that fetches from `GET /api/goals` and pre-fills the form. Call it on mount.

**Step 2: Verify**

- Set goals, navigate away, return to goals page
- Form should show previously saved values

**Step 3: Run type check and commit**

```
fix: load existing goals on goals page
```
