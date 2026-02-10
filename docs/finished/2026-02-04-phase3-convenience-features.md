# Phase 3: Convenience Features - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make logging faster with favorites, recents, copy-yesterday, custom meal types, and entry editing.

**Architecture:** Reuse existing API routes and add a small `mealTypes` service layer. Keep convenience features in UI components and lightweight endpoints that aggregate from existing tables.

**Tech Stack:** SvelteKit 2.x, Svelte 5, Bun, Drizzle ORM, PostgreSQL, shadcn-svelte, Tailwind CSS 4.x

---

## Task 1: Custom Meal Types API + Settings UI

**Files:**
- Create: `src/lib/server/meal-types.ts`
- Create: `src/routes/api/meal-types/+server.ts`
- Create: `src/routes/api/meal-types/[id]/+server.ts`
- Create: `src/routes/app/settings/+page.svelte`
- Create: `tests/server/meal-types.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { toMealTypeInsert } from '../../src/lib/server/meal-types';

describe('toMealTypeInsert', () => {
	test('maps meal type input to row', () => {
		const row = toMealTypeInsert('user-1', { name: 'Second Breakfast', sortOrder: 3 });
		expect(row.userId).toBe('user-1');
		expect(row.name).toBe('Second Breakfast');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/server/meal-types.test.ts`
Expected: FAIL with “Cannot find module …/meal-types”

**Step 3: Write minimal implementation**

Create `src/lib/server/meal-types.ts`:
```ts
import { db } from '$lib/server/db';
import { customMealTypes } from '$lib/server/schema';
import { eq, and } from 'drizzle-orm';

export type MealTypeInput = { name: string; sortOrder: number };

export const toMealTypeInsert = (userId: string, input: MealTypeInput) => ({
	userId,
	name: input.name,
	sortOrder: input.sortOrder
});

export const listMealTypes = async (userId: string) => {
	return db.select().from(customMealTypes).where(eq(customMealTypes.userId, userId)).orderBy(customMealTypes.sortOrder);
};

export const createMealType = async (userId: string, input: MealTypeInput) => {
	const [created] = await db.insert(customMealTypes).values(toMealTypeInsert(userId, input)).returning();
	return created;
};

export const updateMealType = async (userId: string, id: string, input: Partial<MealTypeInput>) => {
	const [updated] = await db
		.update(customMealTypes)
		.set({ ...input })
		.where(and(eq(customMealTypes.id, id), eq(customMealTypes.userId, userId)))
		.returning();
	return updated;
};

export const deleteMealType = async (userId: string, id: string) => {
	await db.delete(customMealTypes).where(and(eq(customMealTypes.id, id), eq(customMealTypes.userId, userId)));
};
```

Create `src/routes/api/meal-types/+server.ts`:
```ts
import { json } from '@sveltejs/kit';
import { createMealType, listMealTypes } from '$lib/server/meal-types';

export const GET = async ({ locals }) => {
	const mealTypes = await listMealTypes(locals.user.id);
	return json({ mealTypes });
};

export const POST = async ({ locals, request }) => {
	const body = await request.json();
	const mealType = await createMealType(locals.user.id, body);
	return json({ mealType }, { status: 201 });
};
```

Create `src/routes/api/meal-types/[id]/+server.ts`:
```ts
import { json } from '@sveltejs/kit';
import { deleteMealType, updateMealType } from '$lib/server/meal-types';

export const PATCH = async ({ locals, params, request }) => {
	const body = await request.json();
	const mealType = await updateMealType(locals.user.id, params.id, body);
	return json({ mealType });
};

export const DELETE = async ({ locals, params }) => {
	await deleteMealType(locals.user.id, params.id);
	return new Response(null, { status: 204 });
};
```

Create `src/routes/app/settings/+page.svelte`:
```svelte
<script lang="ts">
	let mealTypes: Array<any> = [];
	let newName = '';

	const loadMealTypes = async () => {
		const res = await fetch('/api/meal-types');
		mealTypes = (await res.json()).mealTypes;
	};

	const addMealType = async () => {
		await fetch('/api/meal-types', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name: newName, sortOrder: mealTypes.length + 1 })
		});
		newName = '';
		await loadMealTypes();
	};

	const removeMealType = async (id: string) => {
		await fetch(`/api/meal-types/${id}`, { method: 'DELETE' });
		await loadMealTypes();
	};

	loadMealTypes();
</script>

<div class="mx-auto max-w-2xl space-y-6 p-6">
	<h1 class="text-2xl font-semibold">Settings</h1>
	<div class="rounded border p-4">
		<h2 class="mb-3 font-medium">Custom Meal Types</h2>
		<div class="flex gap-2">
			<input class="flex-1 rounded border p-2" placeholder="Add meal type" bind:value={newName} />
			<button class="rounded bg-black px-4 py-2 text-white" on:click={addMealType}>Add</button>
		</div>
		<ul class="mt-4 space-y-2">
			{#each mealTypes as meal}
				<li class="flex items-center justify-between rounded border p-2">
					<span>{meal.name}</span>
					<button class="rounded border px-3 py-1" on:click={() => removeMealType(meal.id)}>Remove</button>
				</li>
			{/each}
		</ul>
	</div>
</div>
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/server/meal-types.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/server/meal-types.ts src/routes/api/meal-types src/routes/app/settings/+page.svelte tests/server/meal-types.test.ts
git commit -m "feat: add custom meal types"
```

---

## Task 2: Merge Default + Custom Meal Types

**Files:**
- Modify: `src/lib/utils/meals.ts`
- Create: `tests/utils/meals.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { mergeMealTypes } from '../../src/lib/utils/meals';

describe('mergeMealTypes', () => {
	test('appends custom meal types after defaults', () => {
		const merged = mergeMealTypes(['Breakfast', 'Lunch'], ['Snack 2']);
		expect(merged).toEqual(['Breakfast', 'Lunch', 'Snack 2']);
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/utils/meals.test.ts`
Expected: FAIL with “mergeMealTypes is not exported”

**Step 3: Write minimal implementation**

Update `src/lib/utils/meals.ts`:
```ts
export const mergeMealTypes = (defaults: string[], custom: string[]) => {
	return [...defaults, ...custom];
};
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/utils/meals.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/utils/meals.ts tests/utils/meals.test.ts
git commit -m "feat: merge custom meal types"
```

---

## Task 3: Favorites Toggle + Favorites Tab

**Files:**
- Modify: `src/lib/components/foods/FoodForm.svelte`
- Modify: `src/lib/components/entries/AddFoodModal.svelte`
- Create: `src/lib/utils/favorites.ts`
- Create: `tests/utils/favorites.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { onlyFavorites } from '../../src/lib/utils/favorites';

describe('onlyFavorites', () => {
	test('filters foods by isFavorite', () => {
		const foods = [
			{ id: '1', name: 'Eggs', isFavorite: true },
			{ id: '2', name: 'Oats', isFavorite: false }
		];
		expect(onlyFavorites(foods)).toHaveLength(1);
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/utils/favorites.test.ts`
Expected: FAIL with “Cannot find module …/favorites”

**Step 3: Write minimal implementation**

Create `src/lib/utils/favorites.ts`:
```ts
export const onlyFavorites = <T extends { isFavorite?: boolean }>(foods: T[]) =>
	foods.filter((food) => food.isFavorite);
```

Modify `src/lib/components/foods/FoodForm.svelte` to include a favorite toggle:
```svelte
<label class="flex items-center gap-2">
	<input type="checkbox" bind:checked={form.isFavorite} />
	<span>Favorite</span>
</label>
```

Modify `src/lib/components/entries/AddFoodModal.svelte` to add a Favorites tab:
```svelte
<script lang="ts">
	import { onlyFavorites } from '$lib/utils/favorites';
	let tab: 'search' | 'favorites' | 'recent' = 'search';
</script>

<div class="flex gap-2">
	<button class="rounded border px-2 py-1" on:click={() => (tab = 'search')}>Search</button>
	<button class="rounded border px-2 py-1" on:click={() => (tab = 'favorites')}>Favorites</button>
	<button class="rounded border px-2 py-1" on:click={() => (tab = 'recent')}>Recent</button>
</div>

{#if tab === 'favorites'}
	<ul class="max-h-60 space-y-2 overflow-auto">
		{#each onlyFavorites(foods) as food}
			<li class="flex items-center justify-between">
				<span>{food.name}</span>
				<button class="rounded border px-2 py-1" on:click={() => onSave({ foodId: food.id, mealType, servings })}>Add</button>
			</li>
		{/each}
	</ul>
{/if}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/utils/favorites.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/utils/favorites.ts src/lib/components/foods/FoodForm.svelte src/lib/components/entries/AddFoodModal.svelte tests/utils/favorites.test.ts
git commit -m "feat: add favorites toggle and tab"
```

---

## Task 4: Recent Foods API + Recent Tab

**Files:**
- Modify: `src/lib/server/foods.ts`
- Create: `src/routes/api/foods/recent/+server.ts`
- Create: `tests/utils/recents.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { uniqueById } from '../../src/lib/utils/recents';

describe('uniqueById', () => {
	test('dedupes foods by id', () => {
		const foods = [
			{ id: '1', name: 'Eggs' },
			{ id: '1', name: 'Eggs' },
			{ id: '2', name: 'Oats' }
		];
		expect(uniqueById(foods)).toHaveLength(2);
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/utils/recents.test.ts`
Expected: FAIL with “Cannot find module …/recents”

**Step 3: Write minimal implementation**

Create `src/lib/utils/recents.ts`:
```ts
export const uniqueById = <T extends { id: string }>(items: T[]) => {
	const seen = new Set<string>();
	return items.filter((item) => {
		if (seen.has(item.id)) return false;
		seen.add(item.id);
		return true;
	});
};
```

Update `src/lib/server/foods.ts`:
```ts
import { foodEntries } from '$lib/server/schema';
import { desc } from 'drizzle-orm';

export const listRecentFoods = async (userId: string) => {
	return db
		.select({ id: foods.id, name: foods.name, brand: foods.brand, isFavorite: foods.isFavorite })
		.from(foodEntries)
		.leftJoin(foods, eq(foodEntries.foodId, foods.id))
		.where(eq(foodEntries.userId, userId))
		.orderBy(desc(foodEntries.createdAt))
		.limit(25);
};
```

Create `src/routes/api/foods/recent/+server.ts`:
```ts
import { json } from '@sveltejs/kit';
import { listRecentFoods } from '$lib/server/foods';

export const GET = async ({ locals }) => {
	const foods = await listRecentFoods(locals.user.id);
	return json({ foods });
};
```

Modify `src/lib/components/entries/AddFoodModal.svelte` to load recent foods when tab is active.

**Step 4: Run test to verify it passes**

Run: `bun test tests/utils/recents.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/utils/recents.ts src/lib/server/foods.ts src/routes/api/foods/recent/+server.ts tests/utils/recents.test.ts
git commit -m "feat: add recent foods API"
```

---

## Task 5: Copy Yesterday Endpoint + UI Action

**Files:**
- Create: `src/lib/utils/dates.ts`
- Modify: `src/lib/server/entries.ts`
- Create: `src/routes/api/entries/copy/+server.ts`
- Modify: `src/routes/app/+page.svelte`
- Create: `tests/utils/dates.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { shiftDate } from '../../src/lib/utils/dates';

describe('shiftDate', () => {
	test('shifts date by days', () => {
		expect(shiftDate('2026-02-03', -1)).toBe('2026-02-02');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/utils/dates.test.ts`
Expected: FAIL with “Cannot find module …/dates”

**Step 3: Write minimal implementation**

Create `src/lib/utils/dates.ts`:
```ts
export const shiftDate = (isoDate: string, days: number) => {
	const date = new Date(isoDate + 'T00:00:00Z');
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
};
```

Update `src/lib/server/entries.ts`:
```ts
export const copyEntries = async (userId: string, fromDate: string, toDate: string) => {
	const entries = await db
		.select()
		.from(foodEntries)
		.where(and(eq(foodEntries.userId, userId), eq(foodEntries.date, fromDate)));

	if (!entries.length) return [];

	const rows = entries.map((entry) => ({
		userId,
		foodId: entry.foodId,
		recipeId: entry.recipeId,
		mealType: entry.mealType,
		servings: entry.servings,
		notes: entry.notes,
		date: toDate
	}));

	return db.insert(foodEntries).values(rows).returning();
};
```

Create `src/routes/api/entries/copy/+server.ts`:
```ts
import { json } from '@sveltejs/kit';
import { copyEntries } from '$lib/server/entries';

export const POST = async ({ locals, url }) => {
	const fromDate = url.searchParams.get('fromDate');
	const toDate = url.searchParams.get('toDate');
	if (!fromDate || !toDate) return json({ error: 'Missing dates' }, { status: 400 });
	const entries = await copyEntries(locals.user.id, fromDate, toDate);
	return json({ entries });
};
```

Modify `src/routes/app/+page.svelte` to add a “Copy Yesterday” button that calls the endpoint.

**Step 4: Run test to verify it passes**

Run: `bun test tests/utils/dates.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/utils/dates.ts src/lib/server/entries.ts src/routes/api/entries/copy/+server.ts src/routes/app/+page.svelte tests/utils/dates.test.ts
git commit -m "feat: add copy yesterday"
```

---

## Task 6: Edit/Delete Entry UI

**Files:**
- Create: `src/lib/components/entries/EditEntryModal.svelte`
- Modify: `src/lib/components/entries/MealSection.svelte`
- Create: `src/lib/utils/entries-ui.ts`
- Create: `tests/utils/entries-ui.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { formatEntryLabel } from '../../src/lib/utils/entries-ui';

describe('formatEntryLabel', () => {
	test('formats entry label with servings', () => {
		expect(formatEntryLabel('Oats', 2)).toBe('Oats × 2');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/utils/entries-ui.test.ts`
Expected: FAIL with “Cannot find module …/entries-ui”

**Step 3: Write minimal implementation**

Create `src/lib/utils/entries-ui.ts`:
```ts
export const formatEntryLabel = (name: string, servings: number) => `${name} × ${servings}`;
```

Create `src/lib/components/entries/EditEntryModal.svelte`:
```svelte
<script lang="ts">
	export let open = false;
	export let entry: { id: string; servings: number; mealType: string } | null = null;
	export let onClose: () => void;
	export let onSave: (payload: { id: string; servings: number; mealType: string }) => void;
</script>

{#if open && entry}
	<div class="fixed inset-0 bg-black/40 p-6">
		<div class="mx-auto max-w-md space-y-4 rounded bg-white p-6">
			<h3 class="text-lg font-semibold">Edit Entry</h3>
			<label class="grid gap-2">
				<span>Servings</span>
				<input class="rounded border p-2" type="number" bind:value={entry.servings} />
			</label>
			<label class="grid gap-2">
				<span>Meal</span>
				<input class="rounded border p-2" bind:value={entry.mealType} />
			</label>
			<div class="flex justify-end gap-2">
				<button class="rounded border px-3 py-1" on:click={onClose}>Cancel</button>
				<button class="rounded bg-black px-3 py-1 text-white" on:click={() => onSave(entry)}>Save</button>
			</div>
		</div>
	</div>
{/if}
```

Modify `src/lib/components/entries/MealSection.svelte` to include Edit/Delete buttons and open `EditEntryModal` from the dashboard.

**Step 4: Run test to verify it passes**

Run: `bun test tests/utils/entries-ui.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/utils/entries-ui.ts src/lib/components/entries/EditEntryModal.svelte src/lib/components/entries/MealSection.svelte tests/utils/entries-ui.test.ts
git commit -m "feat: add entry edit/delete UI"
```
