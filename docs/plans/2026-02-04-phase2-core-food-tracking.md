# Phase 2: Core Food Tracking - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver the core food logging loop: CRUD foods, log daily entries, set goals, and show dashboard totals/progress.

**Architecture:** Build a small server “service” layer under `src/lib/server/*` for DB operations and validation. Expose SvelteKit API routes under `src/routes/api/*` and consume them from app pages. Keep UI state in page-level load/actions and small components.

**Tech Stack:** SvelteKit 2.x, Svelte 5, Bun, Drizzle ORM, PostgreSQL, shadcn-svelte, Tailwind CSS 4.x

---

## Task 1: Core Meal + Nutrition Utilities

**Files:**
- Create: `src/lib/utils/meals.ts`
- Create: `src/lib/utils/nutrition.ts`
- Create: `tests/utils/nutrition.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { calculateDailyTotals, calculateEntryTotals } from '../../src/lib/utils/nutrition';

describe('nutrition utilities', () => {
	test('calculateEntryTotals scales macros by servings', () => {
		const totals = calculateEntryTotals(
			{ calories: 100, protein: 10, carbs: 20, fat: 5, fiber: 3 },
			2
		);
		expect(totals).toEqual({ calories: 200, protein: 20, carbs: 40, fat: 10, fiber: 6 });
	});

	test('calculateDailyTotals sums entry totals', () => {
		const totals = calculateDailyTotals([
			{ calories: 100, protein: 10, carbs: 20, fat: 5, fiber: 3 },
			{ calories: 200, protein: 5, carbs: 10, fat: 2, fiber: 1 }
		]);
		expect(totals).toEqual({ calories: 300, protein: 15, carbs: 30, fat: 7, fiber: 4 });
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/utils/nutrition.test.ts`
Expected: FAIL with “Cannot find module …/nutrition”

**Step 3: Write minimal implementation**

Create `src/lib/utils/meals.ts`:
```ts
export const DEFAULT_MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'] as const;
export type DefaultMealType = (typeof DEFAULT_MEAL_TYPES)[number];
```

Create `src/lib/utils/nutrition.ts`:
```ts
export type MacroTotals = {
	calories: number;
	protein: number;
	carbs: number;
	fat: number;
	fiber: number;
};

export const emptyTotals = (): MacroTotals => ({
	calories: 0,
	protein: 0,
	carbs: 0,
	fat: 0,
	fiber: 0
});

export const addTotals = (a: MacroTotals, b: MacroTotals): MacroTotals => ({
	calories: a.calories + b.calories,
	protein: a.protein + b.protein,
	carbs: a.carbs + b.carbs,
	fat: a.fat + b.fat,
	fiber: a.fiber + b.fiber
});

export const scaleTotals = (t: MacroTotals, factor: number): MacroTotals => ({
	calories: t.calories * factor,
	protein: t.protein * factor,
	carbs: t.carbs * factor,
	fat: t.fat * factor,
	fiber: t.fiber * factor
});

export const calculateEntryTotals = (
	food: MacroTotals,
	servings: number
): MacroTotals => scaleTotals(food, servings);

export const calculateDailyTotals = (entries: MacroTotals[]): MacroTotals =>
	entries.reduce(addTotals, emptyTotals());
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/utils/nutrition.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/utils/meals.ts src/lib/utils/nutrition.ts tests/utils/nutrition.test.ts
git commit -m "feat: add meal and nutrition utilities"
```

---

## Task 2: Add Request Validation Schemas

**Files:**
- Modify: `package.json`
- Create: `src/lib/server/validation/foods.ts`
- Create: `src/lib/server/validation/entries.ts`
- Create: `src/lib/server/validation/goals.ts`
- Create: `src/lib/server/validation/index.ts`
- Create: `tests/server/validation.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { foodCreateSchema, entryCreateSchema, goalsSchema } from '../../src/lib/server/validation';

describe('validation schemas', () => {
	test('foodCreateSchema requires name and macros', () => {
		const result = foodCreateSchema.safeParse({ name: 'Eggs' });
		expect(result.success).toBe(false);
	});

	test('entryCreateSchema coerces numeric values', () => {
		const result = entryCreateSchema.parse({
			foodId: '00000000-0000-0000-0000-000000000000',
			mealType: 'Breakfast',
			servings: '2',
			date: '2026-02-03'
		});
		expect(result.servings).toBe(2);
	});

	test('goalsSchema requires all macro goals', () => {
		const result = goalsSchema.safeParse({ calorieGoal: 2000 });
		expect(result.success).toBe(false);
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/server/validation.test.ts`
Expected: FAIL with “Cannot find module …/validation”

**Step 3: Write minimal implementation**

Run:
```bash
bun add zod
```

Create `src/lib/server/validation/foods.ts`:
```ts
import { z } from 'zod';

export const foodCreateSchema = z.object({
	name: z.string().min(1),
	brand: z.string().optional().nullable(),
	servingSize: z.coerce.number().positive(),
	servingUnit: z.string().min(1),
	calories: z.coerce.number().nonnegative(),
	protein: z.coerce.number().nonnegative(),
	carbs: z.coerce.number().nonnegative(),
	fat: z.coerce.number().nonnegative(),
	fiber: z.coerce.number().nonnegative(),
	barcode: z.string().optional().nullable(),
	isFavorite: z.coerce.boolean().optional()
});

export const foodUpdateSchema = foodCreateSchema.partial();
```

Create `src/lib/server/validation/entries.ts`:
```ts
import { z } from 'zod';

export const entryCreateSchema = z.object({
	foodId: z.string().uuid().optional(),
	recipeId: z.string().uuid().optional(),
	mealType: z.string().min(1),
	servings: z.coerce.number().positive(),
	notes: z.string().optional().nullable(),
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
}).refine((val) => val.foodId || val.recipeId, {
	message: 'foodId or recipeId is required'
});

export const entryUpdateSchema = entryCreateSchema.partial();
```

Create `src/lib/server/validation/goals.ts`:
```ts
import { z } from 'zod';

export const goalsSchema = z.object({
	calorieGoal: z.coerce.number().positive(),
	proteinGoal: z.coerce.number().nonnegative(),
	carbGoal: z.coerce.number().nonnegative(),
	fatGoal: z.coerce.number().nonnegative(),
	fiberGoal: z.coerce.number().nonnegative()
});
```

Create `src/lib/server/validation/index.ts`:
```ts
export * from './foods';
export * from './entries';
export * from './goals';
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/server/validation.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add package.json bun.lock src/lib/server/validation tests/server/validation.test.ts
git commit -m "feat: add request validation schemas"
```

---

## Task 3: Foods API (List + Create)

**Files:**
- Create: `src/lib/server/foods.ts`
- Create: `src/routes/api/foods/+server.ts`
- Create: `tests/server/foods-mapping.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { toFoodInsert } from '../../src/lib/server/foods';

describe('toFoodInsert', () => {
	test('maps validated input to insert row', () => {
		const input = {
			name: 'Oats',
			brand: null,
			servingSize: 40,
			servingUnit: 'g',
			calories: 150,
			protein: 5,
			carbs: 27,
			fat: 3,
			fiber: 4
		};
		const row = toFoodInsert('user-id', input);
		expect(row.userId).toBe('user-id');
		expect(row.name).toBe('Oats');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/server/foods-mapping.test.ts`
Expected: FAIL with “Cannot find module …/foods”

**Step 3: Write minimal implementation**

Create `src/lib/server/foods.ts`:
```ts
import { db } from '$lib/server/db';
import { foods } from '$lib/server/schema';
import { foodCreateSchema } from '$lib/server/validation';
import { eq, ilike } from 'drizzle-orm';

type FoodCreateInput = typeof foodCreateSchema._type;

export const toFoodInsert = (userId: string, input: FoodCreateInput) => ({
	userId,
	name: input.name,
	brand: input.brand ?? null,
	servingSize: input.servingSize,
	servingUnit: input.servingUnit,
	calories: input.calories,
	protein: input.protein,
	carbs: input.carbs,
	fat: input.fat,
	fiber: input.fiber,
	barcode: input.barcode ?? null,
	isFavorite: input.isFavorite ?? false
});

export const listFoods = async (userId: string, query?: string) => {
	const base = db.select().from(foods).where(eq(foods.userId, userId));
	if (!query) return base.orderBy(foods.name);
	return base.where(ilike(foods.name, `%${query}%`)).orderBy(foods.name);
};

export const createFood = async (userId: string, payload: unknown) => {
	const parsed = foodCreateSchema.parse(payload);
	const [created] = await db.insert(foods).values(toFoodInsert(userId, parsed)).returning();
	return created;
};
```

Create `src/routes/api/foods/+server.ts`:
```ts
import { json } from '@sveltejs/kit';
import { createFood, listFoods } from '$lib/server/foods';

export const GET = async ({ locals, url }) => {
	const query = url.searchParams.get('q') ?? undefined;
	const foods = await listFoods(locals.user.id, query);
	return json({ foods });
};

export const POST = async ({ locals, request }) => {
	const body = await request.json();
	const food = await createFood(locals.user.id, body);
	return json({ food }, { status: 201 });
};
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/server/foods-mapping.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/server/foods.ts src/routes/api/foods/+server.ts tests/server/foods-mapping.test.ts
git commit -m "feat: add foods list/create API"
```

---

## Task 4: Foods API (Update + Delete)

**Files:**
- Create: `src/routes/api/foods/[id]/+server.ts`
- Modify: `src/lib/server/foods.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { toFoodUpdate } from '../../src/lib/server/foods';

describe('toFoodUpdate', () => {
	test('maps partial input to update row', () => {
		const row = toFoodUpdate({ name: 'Greek Yogurt', calories: 120 });
		expect(row.name).toBe('Greek Yogurt');
		expect(row.calories).toBe(120);
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/server/foods-mapping.test.ts`
Expected: FAIL with “toFoodUpdate is not exported”

**Step 3: Write minimal implementation**

Update `src/lib/server/foods.ts`:
```ts
import { foodUpdateSchema } from '$lib/server/validation';
import { and } from 'drizzle-orm';

export const toFoodUpdate = (input: typeof foodUpdateSchema._type) => ({
	...input,
	brand: input.brand ?? null,
	barcode: input.barcode ?? null
});

export const updateFood = async (userId: string, id: string, payload: unknown) => {
	const parsed = foodUpdateSchema.parse(payload);
	const [updated] = await db
		.update(foods)
		.set({ ...toFoodUpdate(parsed), updatedAt: new Date() })
		.where(and(eq(foods.id, id), eq(foods.userId, userId)))
		.returning();
	return updated;
};

export const deleteFood = async (userId: string, id: string) => {
	await db.delete(foods).where(and(eq(foods.id, id), eq(foods.userId, userId)));
};
```

Create `src/routes/api/foods/[id]/+server.ts`:
```ts
import { json } from '@sveltejs/kit';
import { deleteFood, updateFood } from '$lib/server/foods';

export const PATCH = async ({ locals, request, params }) => {
	const body = await request.json();
	const food = await updateFood(locals.user.id, params.id, body);
	return json({ food });
};

export const DELETE = async ({ locals, params }) => {
	await deleteFood(locals.user.id, params.id);
	return new Response(null, { status: 204 });
};
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/server/foods-mapping.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/server/foods.ts src/routes/api/foods/[id]/+server.ts tests/server/foods-mapping.test.ts
git commit -m "feat: add foods update/delete API"
```

---

## Task 5: Entries API (List + Create) and Grouping Helper

**Files:**
- Create: `src/lib/server/entries.ts`
- Create: `src/lib/utils/entries.ts`
- Create: `src/routes/api/entries/+server.ts`
- Create: `tests/utils/entries.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { groupEntriesByMeal } from '../../src/lib/utils/entries';

describe('groupEntriesByMeal', () => {
	test('groups entries by meal type', () => {
		const grouped = groupEntriesByMeal([
			{ id: '1', mealType: 'Breakfast', calories: 100 },
			{ id: '2', mealType: 'Lunch', calories: 200 },
			{ id: '3', mealType: 'Breakfast', calories: 50 }
		]);
		expect(grouped.Breakfast).toHaveLength(2);
		expect(grouped.Lunch).toHaveLength(1);
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/utils/entries.test.ts`
Expected: FAIL with “Cannot find module …/entries”

**Step 3: Write minimal implementation**

Create `src/lib/utils/entries.ts`:
```ts
export type EntryListItem = {
	id: string;
	mealType: string;
	calories: number;
	protein?: number;
	carbs?: number;
	fat?: number;
	fiber?: number;
};

export const groupEntriesByMeal = (entries: EntryListItem[]) => {
	return entries.reduce<Record<string, EntryListItem[]>>((acc, entry) => {
		acc[entry.mealType] ??= [];
		acc[entry.mealType].push(entry);
		return acc;
	}, {});
};
```

Create `src/lib/server/entries.ts`:
```ts
import { db } from '$lib/server/db';
import { foodEntries, foods } from '$lib/server/schema';
import { entryCreateSchema } from '$lib/server/validation';
import { and, eq } from 'drizzle-orm';

export const listEntriesByDate = async (userId: string, date: string) => {
	return db
		.select({
			id: foodEntries.id,
			mealType: foodEntries.mealType,
			servings: foodEntries.servings,
			notes: foodEntries.notes,
			foodId: foodEntries.foodId,
			foodName: foods.name,
			calories: foods.calories,
			protein: foods.protein,
			carbs: foods.carbs,
			fat: foods.fat,
			fiber: foods.fiber
		})
		.from(foodEntries)
		.leftJoin(foods, eq(foodEntries.foodId, foods.id))
		.where(and(eq(foodEntries.userId, userId), eq(foodEntries.date, date)));
};

export const createEntry = async (userId: string, payload: unknown) => {
	const parsed = entryCreateSchema.parse(payload);
	const [created] = await db
		.insert(foodEntries)
		.values({
			userId,
			foodId: parsed.foodId ?? null,
			recipeId: parsed.recipeId ?? null,
			mealType: parsed.mealType,
			servings: parsed.servings,
			notes: parsed.notes ?? null,
			date: parsed.date
		})
		.returning();
	return created;
};
```

Create `src/routes/api/entries/+server.ts`:
```ts
import { json } from '@sveltejs/kit';
import { createEntry, listEntriesByDate } from '$lib/server/entries';

export const GET = async ({ locals, url }) => {
	const date = url.searchParams.get('date');
	if (!date) return json({ error: 'Missing date' }, { status: 400 });
	const entries = await listEntriesByDate(locals.user.id, date);
	return json({ entries });
};

export const POST = async ({ locals, request }) => {
	const body = await request.json();
	const entry = await createEntry(locals.user.id, body);
	return json({ entry }, { status: 201 });
};
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/utils/entries.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/utils/entries.ts src/lib/server/entries.ts src/routes/api/entries/+server.ts tests/utils/entries.test.ts
git commit -m "feat: add entries list/create API"
```

---

## Task 6: Entries API (Update + Delete)

**Files:**
- Create: `src/routes/api/entries/[id]/+server.ts`
- Modify: `src/lib/server/entries.ts`
- Create: `tests/server/entries-mapping.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { toEntryUpdate } from '../../src/lib/server/entries';

describe('toEntryUpdate', () => {
	test('maps partial update fields', () => {
		const row = toEntryUpdate({ servings: 1.5, mealType: 'Lunch' });
		expect(row.servings).toBe(1.5);
		expect(row.mealType).toBe('Lunch');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/server/entries-mapping.test.ts`
Expected: FAIL with “toEntryUpdate is not exported”

**Step 3: Write minimal implementation**

Update `src/lib/server/entries.ts`:
```ts
import { entryUpdateSchema } from '$lib/server/validation';

export const toEntryUpdate = (input: typeof entryUpdateSchema._type) => ({
	...input,
	notes: input.notes ?? null
});

export const updateEntry = async (userId: string, id: string, payload: unknown) => {
	const parsed = entryUpdateSchema.parse(payload);
	const [updated] = await db
		.update(foodEntries)
		.set({ ...toEntryUpdate(parsed), updatedAt: new Date() })
		.where(and(eq(foodEntries.id, id), eq(foodEntries.userId, userId)))
		.returning();
	return updated;
};

export const deleteEntry = async (userId: string, id: string) => {
	await db.delete(foodEntries).where(and(eq(foodEntries.id, id), eq(foodEntries.userId, userId)));
};
```

Create `src/routes/api/entries/[id]/+server.ts`:
```ts
import { json } from '@sveltejs/kit';
import { deleteEntry, updateEntry } from '$lib/server/entries';

export const PATCH = async ({ locals, request, params }) => {
	const body = await request.json();
	const entry = await updateEntry(locals.user.id, params.id, body);
	return json({ entry });
};

export const DELETE = async ({ locals, params }) => {
	await deleteEntry(locals.user.id, params.id);
	return new Response(null, { status: 204 });
};
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/server/entries-mapping.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/server/entries.ts src/routes/api/entries/[id]/+server.ts tests/server/entries-mapping.test.ts
git commit -m "feat: add entries update/delete API"
```

---

## Task 7: Goals API + Goal Form Page

**Files:**
- Create: `src/lib/server/goals.ts`
- Create: `src/routes/api/goals/+server.ts`
- Create: `src/routes/app/goals/+page.svelte`
- Create: `tests/server/goals-mapping.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { toGoalsUpsert } from '../../src/lib/server/goals';

describe('toGoalsUpsert', () => {
	test('maps goal input to row', () => {
		const row = toGoalsUpsert('user-1', {
			calorieGoal: 2000,
			proteinGoal: 150,
			carbGoal: 220,
			fatGoal: 60,
			fiberGoal: 30
		});
		expect(row.userId).toBe('user-1');
		expect(row.calorieGoal).toBe(2000);
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/server/goals-mapping.test.ts`
Expected: FAIL with “Cannot find module …/goals”

**Step 3: Write minimal implementation**

Create `src/lib/server/goals.ts`:
```ts
import { db } from '$lib/server/db';
import { userGoals } from '$lib/server/schema';
import { goalsSchema } from '$lib/server/validation';
import { eq } from 'drizzle-orm';

type GoalsInput = typeof goalsSchema._type;

export const toGoalsUpsert = (userId: string, input: GoalsInput) => ({
	userId,
	...input,
	updatedAt: new Date()
});

export const getGoals = async (userId: string) => {
	const [goal] = await db.select().from(userGoals).where(eq(userGoals.userId, userId));
	return goal ?? null;
};

export const upsertGoals = async (userId: string, payload: unknown) => {
	const parsed = goalsSchema.parse(payload);
	const [goal] = await db
		.insert(userGoals)
		.values(toGoalsUpsert(userId, parsed))
		.onConflictDoUpdate({
			target: userGoals.userId,
			set: { ...parsed, updatedAt: new Date() }
		})
		.returning();
	return goal;
};
```

Create `src/routes/api/goals/+server.ts`:
```ts
import { json } from '@sveltejs/kit';
import { getGoals, upsertGoals } from '$lib/server/goals';

export const GET = async ({ locals }) => {
	const goals = await getGoals(locals.user.id);
	return json({ goals });
};

export const POST = async ({ locals, request }) => {
	const body = await request.json();
	const goals = await upsertGoals(locals.user.id, body);
	return json({ goals });
};
```

Create `src/routes/app/goals/+page.svelte`:
```svelte
<script lang="ts">
	let form = {
		calorieGoal: 2000,
		proteinGoal: 150,
		carbGoal: 220,
		fatGoal: 60,
		fiberGoal: 30
	};

	const saveGoals = async () => {
		await fetch('/api/goals', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(form)
		});
	};
</script>

<div class="mx-auto max-w-xl space-y-6 p-6">
	<h1 class="text-2xl font-semibold">Goals</h1>
	<div class="grid gap-4">
		<label class="grid gap-2">
			<span>Calories</span>
			<input class="rounded border p-2" type="number" bind:value={form.calorieGoal} />
		</label>
		<label class="grid gap-2">
			<span>Protein (g)</span>
			<input class="rounded border p-2" type="number" bind:value={form.proteinGoal} />
		</label>
		<label class="grid gap-2">
			<span>Carbs (g)</span>
			<input class="rounded border p-2" type="number" bind:value={form.carbGoal} />
		</label>
		<label class="grid gap-2">
			<span>Fat (g)</span>
			<input class="rounded border p-2" type="number" bind:value={form.fatGoal} />
		</label>
		<label class="grid gap-2">
			<span>Fiber (g)</span>
			<input class="rounded border p-2" type="number" bind:value={form.fiberGoal} />
		</label>
	</div>
	<button class="rounded bg-black px-4 py-2 text-white" on:click={saveGoals}>Save</button>
</div>
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/server/goals-mapping.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/server/goals.ts src/routes/api/goals/+server.ts src/routes/app/goals/+page.svelte tests/server/goals-mapping.test.ts
git commit -m "feat: add goals API and page"
```

---

## Task 8: Food Database UI

**Files:**
- Create: `src/routes/app/foods/+page.svelte`
- Create: `src/lib/components/foods/FoodForm.svelte`
- Create: `src/lib/components/foods/FoodList.svelte`
- Create: `src/lib/components/foods/foodFilters.ts`
- Create: `tests/utils/foodFilters.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { filterFoods } from '../../src/lib/components/foods/foodFilters';

describe('filterFoods', () => {
	test('filters by name and brand', () => {
		const foods = [
			{ id: '1', name: 'Oats', brand: 'Brand A' },
			{ id: '2', name: 'Greek Yogurt', brand: 'Brand B' }
		];
		const result = filterFoods(foods, 'yogurt');
		expect(result).toHaveLength(1);
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/utils/foodFilters.test.ts`
Expected: FAIL with “Cannot find module …/foodFilters”

**Step 3: Write minimal implementation**

Create `src/lib/components/foods/foodFilters.ts`:
```ts
export const filterFoods = <T extends { name: string; brand?: string | null }>(
	foods: T[],
	query: string
) => {
	const q = query.trim().toLowerCase();
	if (!q) return foods;
	return foods.filter((food) =>
		food.name.toLowerCase().includes(q) || (food.brand ?? '').toLowerCase().includes(q)
	);
};
```

Create `src/lib/components/foods/FoodForm.svelte`:
```svelte
<script lang="ts">
	export let initial = {
		name: '',
		brand: '',
		servingSize: 0,
		servingUnit: 'g',
		calories: 0,
		protein: 0,
		carbs: 0,
		fat: 0,
		fiber: 0
	};
	let form = { ...initial };

	export let onSave: (payload: typeof form) => Promise<void>;
</script>

<div class="grid gap-3">
	<input class="rounded border p-2" placeholder="Name" bind:value={form.name} />
	<input class="rounded border p-2" placeholder="Brand" bind:value={form.brand} />
	<div class="grid grid-cols-2 gap-2">
		<input class="rounded border p-2" type="number" placeholder="Serving size" bind:value={form.servingSize} />
		<input class="rounded border p-2" placeholder="Unit (g, ml, piece)" bind:value={form.servingUnit} />
	</div>
	<div class="grid grid-cols-2 gap-2">
		<input class="rounded border p-2" type="number" placeholder="Calories" bind:value={form.calories} />
		<input class="rounded border p-2" type="number" placeholder="Protein" bind:value={form.protein} />
		<input class="rounded border p-2" type="number" placeholder="Carbs" bind:value={form.carbs} />
		<input class="rounded border p-2" type="number" placeholder="Fat" bind:value={form.fat} />
		<input class="rounded border p-2" type="number" placeholder="Fiber" bind:value={form.fiber} />
	</div>
	<button class="rounded bg-black px-4 py-2 text-white" on:click={() => onSave(form)}>Save</button>
</div>
```

Create `src/lib/components/foods/FoodList.svelte`:
```svelte
<script lang="ts">
	export let foods: Array<{ id: string; name: string; brand?: string | null }> = [];
	export let onEdit: (id: string) => void;
	export let onDelete: (id: string) => void;
</script>

<ul class="space-y-2">
	{#each foods as food}
		<li class="flex items-center justify-between rounded border p-3">
			<div>
				<div class="font-medium">{food.name}</div>
				{#if food.brand}
					<div class="text-sm text-neutral-500">{food.brand}</div>
				{/if}
			</div>
			<div class="flex gap-2">
				<button class="rounded border px-3 py-1" on:click={() => onEdit(food.id)}>Edit</button>
				<button class="rounded border px-3 py-1" on:click={() => onDelete(food.id)}>Delete</button>
			</div>
		</li>
	{/each}
</ul>
```

Create `src/routes/app/foods/+page.svelte`:
```svelte
<script lang="ts">
	import FoodForm from '$lib/components/foods/FoodForm.svelte';
	import FoodList from '$lib/components/foods/FoodList.svelte';
	import { filterFoods } from '$lib/components/foods/foodFilters';

	let foods: Array<any> = [];
	let query = '';

	const loadFoods = async () => {
		const res = await fetch('/api/foods');
		const data = await res.json();
		foods = data.foods;
	};

	const createFood = async (payload: any) => {
		await fetch('/api/foods', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		});
		await loadFoods();
	};

	const deleteFood = async (id: string) => {
		await fetch(`/api/foods/${id}`, { method: 'DELETE' });
		await loadFoods();
	};

	loadFoods();
</script>

<div class="mx-auto max-w-4xl space-y-6 p-6">
	<h1 class="text-2xl font-semibold">Foods</h1>
	<input class="rounded border p-2" placeholder="Search foods" bind:value={query} />
	<FoodList foods={filterFoods(foods, query)} onEdit={() => {}} onDelete={deleteFood} />
	<div class="rounded border p-4">
		<h2 class="mb-3 font-medium">Add food</h2>
		<FoodForm onSave={createFood} />
	</div>
</div>
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/utils/foodFilters.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/components/foods src/routes/app/foods/+page.svelte tests/utils/foodFilters.test.ts
git commit -m "feat: add foods page UI"
```

---

## Task 9: Dashboard UI + Add Food Modal + Progress Colors

**Files:**
- Create: `src/lib/utils/progress.ts`
- Create: `src/lib/components/entries/AddFoodModal.svelte`
- Create: `src/lib/components/entries/MealSection.svelte`
- Modify: `src/routes/app/+page.svelte`
- Create: `tests/utils/progress.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { progressColor } from '../../src/lib/utils/progress';

describe('progressColor', () => {
	test('returns green within 10% of goal', () => {
		expect(progressColor(95, 100)).toBe('text-emerald-600');
	});

	test('returns red when over goal', () => {
		expect(progressColor(120, 100)).toBe('text-red-600');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/utils/progress.test.ts`
Expected: FAIL with “Cannot find module …/progress”

**Step 3: Write minimal implementation**

Create `src/lib/utils/progress.ts`:
```ts
export const progressColor = (value: number, goal: number) => {
	if (!goal) return 'text-neutral-500';
	const ratio = value / goal;
	if (ratio > 1) return 'text-red-600';
	if (ratio >= 0.9) return 'text-emerald-600';
	if (ratio >= 0.8) return 'text-yellow-600';
	return 'text-red-500';
};
```

Create `src/lib/components/entries/MealSection.svelte`:
```svelte
<script lang="ts">
	export let title: string;
	export let entries: Array<{ id: string; name: string; calories: number; servings: number }> = [];
	export let onAdd: () => void;
</script>

<section class="rounded border p-4">
	<div class="flex items-center justify-between">
		<h2 class="text-lg font-semibold">{title}</h2>
		<button class="rounded border px-3 py-1" on:click={onAdd}>Add Food</button>
	</div>
	<ul class="mt-3 space-y-2">
		{#each entries as entry}
			<li class="flex items-center justify-between text-sm">
				<span>{entry.name}</span>
				<span>{entry.calories * entry.servings} kcal</span>
			</li>
		{/each}
	</ul>
</section>
```

Create `src/lib/components/entries/AddFoodModal.svelte`:
```svelte
<script lang="ts">
	export let open = false;
	export let foods: Array<{ id: string; name: string }> = [];
	export let mealType = 'Breakfast';
	let query = '';
	let servings = 1;

	export let onClose: () => void;
	export let onSave: (payload: { foodId: string; mealType: string; servings: number }) => void;

	const filtered = () =>
		foods.filter((food) => food.name.toLowerCase().includes(query.toLowerCase()));
</script>

{#if open}
	<div class="fixed inset-0 bg-black/40 p-6">
		<div class="mx-auto max-w-lg space-y-4 rounded bg-white p-6">
			<div class="flex items-center justify-between">
				<h3 class="text-lg font-semibold">Add Food</h3>
				<button on:click={onClose}>Close</button>
			</div>
			<input class="rounded border p-2" placeholder="Search" bind:value={query} />
			<ul class="max-h-60 space-y-2 overflow-auto">
				{#each filtered() as food}
					<li class="flex items-center justify-between">
						<span>{food.name}</span>
						<button
							class="rounded border px-2 py-1"
							on:click={() => onSave({ foodId: food.id, mealType, servings })}
						>
							Add
						</button>
					</li>
				{/each}
			</ul>
			<label class="grid gap-2">
				<span>Servings</span>
				<input class="rounded border p-2" type="number" bind:value={servings} />
			</label>
		</div>
	</div>
{/if}
```

Modify `src/routes/app/+page.svelte`:
```svelte
<script lang="ts">
	import MealSection from '$lib/components/entries/MealSection.svelte';
	import AddFoodModal from '$lib/components/entries/AddFoodModal.svelte';
	import { calculateDailyTotals } from '$lib/utils/nutrition';
	import { progressColor } from '$lib/utils/progress';

	let foods: Array<any> = [];
	let entries: Array<any> = [];
	let open = false;
	let activeMeal = 'Breakfast';

	const loadData = async () => {
		const foodsRes = await fetch('/api/foods');
		foods = (await foodsRes.json()).foods;
		const entriesRes = await fetch(`/api/entries?date=${new Date().toISOString().slice(0, 10)}`);
		entries = (await entriesRes.json()).entries;
	};

	const addEntry = async (payload: any) => {
		await fetch('/api/entries', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ ...payload, date: new Date().toISOString().slice(0, 10) })
		});
		open = false;
		await loadData();
	};

	const totals = () => calculateDailyTotals(entries);

	loadData();
</script>

<div class="mx-auto max-w-4xl space-y-6 p-6">
	<h1 class="text-2xl font-semibold">Today</h1>
	<div class={`text-lg ${progressColor(totals().calories, 2000)}`}>
		{totals().calories} kcal
	</div>
	<div class="grid gap-4">
		<MealSection title="Breakfast" entries={entries.filter((e) => e.mealType === 'Breakfast')} onAdd={() => { open = true; activeMeal = 'Breakfast'; }} />
		<MealSection title="Lunch" entries={entries.filter((e) => e.mealType === 'Lunch')} onAdd={() => { open = true; activeMeal = 'Lunch'; }} />
		<MealSection title="Dinner" entries={entries.filter((e) => e.mealType === 'Dinner')} onAdd={() => { open = true; activeMeal = 'Dinner'; }} />
		<MealSection title="Snacks" entries={entries.filter((e) => e.mealType === 'Snacks')} onAdd={() => { open = true; activeMeal = 'Snacks'; }} />
	</div>
	<AddFoodModal open={open} foods={foods} mealType={activeMeal} onClose={() => (open = false)} onSave={addEntry} />
</div>
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/utils/progress.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/utils/progress.ts src/lib/components/entries src/routes/app/+page.svelte tests/utils/progress.test.ts
git commit -m "feat: add dashboard and add-food modal"
```
