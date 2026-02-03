# Phase 4: Recipes - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable users to build recipes from foods and log them as entries with per-serving nutrition.

**Architecture:** Add recipe validation and service helpers under `src/lib/server/recipes.ts`. Use a recipe builder UI to assemble ingredients, calculate totals on the client, and persist via API routes.

**Tech Stack:** SvelteKit 2.x, Svelte 5, Bun, Drizzle ORM, PostgreSQL, shadcn-svelte, Tailwind CSS 4.x

---

## Task 1: Recipe Nutrition Utilities

**Files:**
- Create: `src/lib/utils/recipes.ts`
- Create: `tests/utils/recipes.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { calculateRecipeTotals } from '../../src/lib/utils/recipes';

describe('calculateRecipeTotals', () => {
	test('computes per-serving totals from ingredients', () => {
		const totals = calculateRecipeTotals(
			[
				{ calories: 100, protein: 10, carbs: 5, fat: 1, fiber: 2, quantity: 2 },
				{ calories: 50, protein: 5, carbs: 10, fat: 0, fiber: 1, quantity: 1 }
			],
			3
		);
		expect(totals.calories).toBeCloseTo(83.33, 1);
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/utils/recipes.test.ts`
Expected: FAIL with “Cannot find module …/recipes”

**Step 3: Write minimal implementation**

Create `src/lib/utils/recipes.ts`:
```ts
import type { MacroTotals } from '$lib/utils/nutrition';

export type IngredientTotals = MacroTotals & { quantity: number };

export const calculateRecipeTotals = (ingredients: IngredientTotals[], totalServings: number): MacroTotals => {
	const totals = ingredients.reduce<MacroTotals>(
		(acc, item) => ({
			calories: acc.calories + item.calories * item.quantity,
			protein: acc.protein + item.protein * item.quantity,
			carbs: acc.carbs + item.carbs * item.quantity,
			fat: acc.fat + item.fat * item.quantity,
			fiber: acc.fiber + item.fiber * item.quantity
		}),
		{ calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
	);

	return {
		calories: totals.calories / totalServings,
		protein: totals.protein / totalServings,
		carbs: totals.carbs / totalServings,
		fat: totals.fat / totalServings,
		fiber: totals.fiber / totalServings
	};
};
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/utils/recipes.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/utils/recipes.ts tests/utils/recipes.test.ts
git commit -m "feat: add recipe nutrition utilities"
```

---

## Task 2: Recipe Validation Schemas

**Files:**
- Create: `src/lib/server/validation/recipes.ts`
- Modify: `src/lib/server/validation/index.ts`
- Create: `tests/server/recipes-validation.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { recipeCreateSchema } from '../../src/lib/server/validation';

describe('recipeCreateSchema', () => {
	test('requires name and ingredients', () => {
		const result = recipeCreateSchema.safeParse({ name: 'Shake' });
		expect(result.success).toBe(false);
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/server/recipes-validation.test.ts`
Expected: FAIL with “recipeCreateSchema is not exported”

**Step 3: Write minimal implementation**

Create `src/lib/server/validation/recipes.ts`:
```ts
import { z } from 'zod';

export const recipeIngredientSchema = z.object({
	foodId: z.string().uuid(),
	quantity: z.coerce.number().positive(),
	servingUnit: z.string().min(1)
});

export const recipeCreateSchema = z.object({
	name: z.string().min(1),
	totalServings: z.coerce.number().positive(),
	ingredients: z.array(recipeIngredientSchema).min(1)
});

export const recipeUpdateSchema = recipeCreateSchema.partial();
```

Modify `src/lib/server/validation/index.ts`:
```ts
export * from './recipes';
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/server/recipes-validation.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/server/validation/recipes.ts src/lib/server/validation/index.ts tests/server/recipes-validation.test.ts
git commit -m "feat: add recipe validation"
```

---

## Task 3: Recipes API (List + Create)

**Files:**
- Create: `src/lib/server/recipes.ts`
- Create: `src/routes/api/recipes/+server.ts`
- Create: `tests/server/recipes-mapping.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { toRecipeInsert } from '../../src/lib/server/recipes';

describe('toRecipeInsert', () => {
	test('maps recipe input to row', () => {
		const row = toRecipeInsert('user-1', { name: 'Oat Bowl', totalServings: 2 });
		expect(row.userId).toBe('user-1');
		expect(row.name).toBe('Oat Bowl');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/server/recipes-mapping.test.ts`
Expected: FAIL with “Cannot find module …/recipes”

**Step 3: Write minimal implementation**

Create `src/lib/server/recipes.ts`:
```ts
import { db } from '$lib/server/db';
import { recipes, recipeIngredients } from '$lib/server/schema';
import { recipeCreateSchema } from '$lib/server/validation';
import { eq } from 'drizzle-orm';

type RecipeInput = { name: string; totalServings: number };

export const toRecipeInsert = (userId: string, input: RecipeInput) => ({
	userId,
	name: input.name,
	totalServings: input.totalServings
});

export const listRecipes = async (userId: string) => {
	return db.select().from(recipes).where(eq(recipes.userId, userId)).orderBy(recipes.name);
};

export const createRecipe = async (userId: string, payload: unknown) => {
	const parsed = recipeCreateSchema.parse(payload);
	const [recipe] = await db.insert(recipes).values(toRecipeInsert(userId, parsed)).returning();

	const ingredientRows = parsed.ingredients.map((ingredient, index) => ({
		recipeId: recipe.id,
		foodId: ingredient.foodId,
		quantity: ingredient.quantity,
		servingUnit: ingredient.servingUnit,
		sortOrder: index
	}));

	await db.insert(recipeIngredients).values(ingredientRows);
	return recipe;
};
```

Create `src/routes/api/recipes/+server.ts`:
```ts
import { json } from '@sveltejs/kit';
import { createRecipe, listRecipes } from '$lib/server/recipes';

export const GET = async ({ locals }) => {
	const recipes = await listRecipes(locals.user.id);
	return json({ recipes });
};

export const POST = async ({ locals, request }) => {
	const body = await request.json();
	const recipe = await createRecipe(locals.user.id, body);
	return json({ recipe }, { status: 201 });
};
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/server/recipes-mapping.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/server/recipes.ts src/routes/api/recipes/+server.ts tests/server/recipes-mapping.test.ts
git commit -m "feat: add recipes list/create API"
```

---

## Task 4: Recipes API (Get + Update + Delete)

**Files:**
- Modify: `src/lib/server/recipes.ts`
- Create: `src/routes/api/recipes/[id]/+server.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { toRecipeUpdate } from '../../src/lib/server/recipes';

describe('toRecipeUpdate', () => {
	test('maps partial updates', () => {
		const row = toRecipeUpdate({ name: 'Updated' });
		expect(row.name).toBe('Updated');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/server/recipes-mapping.test.ts`
Expected: FAIL with “toRecipeUpdate is not exported”

**Step 3: Write minimal implementation**

Update `src/lib/server/recipes.ts`:
```ts
import { recipeUpdateSchema } from '$lib/server/validation';
import { and } from 'drizzle-orm';

export const toRecipeUpdate = (input: typeof recipeUpdateSchema._type) => ({
	...input
});

export const getRecipe = async (userId: string, id: string) => {
	const [recipe] = await db
		.select()
		.from(recipes)
		.where(and(eq(recipes.id, id), eq(recipes.userId, userId)));

	const ingredients = await db
		.select()
		.from(recipeIngredients)
		.where(eq(recipeIngredients.recipeId, id))
		.orderBy(recipeIngredients.sortOrder);

	return recipe ? { ...recipe, ingredients } : null;
};

export const updateRecipe = async (userId: string, id: string, payload: unknown) => {
	const parsed = recipeUpdateSchema.parse(payload);
	const [recipe] = await db
		.update(recipes)
		.set({ ...toRecipeUpdate(parsed), updatedAt: new Date() })
		.where(and(eq(recipes.id, id), eq(recipes.userId, userId)))
		.returning();

	if (parsed.ingredients) {
		await db.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, id));
		const rows = parsed.ingredients.map((ingredient, index) => ({
			recipeId: id,
			foodId: ingredient.foodId,
			quantity: ingredient.quantity,
			servingUnit: ingredient.servingUnit,
			sortOrder: index
		}));
		await db.insert(recipeIngredients).values(rows);
	}

	return recipe;
};

export const deleteRecipe = async (userId: string, id: string) => {
	await db.delete(recipes).where(and(eq(recipes.id, id), eq(recipes.userId, userId)));
};
```

Create `src/routes/api/recipes/[id]/+server.ts`:
```ts
import { json } from '@sveltejs/kit';
import { deleteRecipe, getRecipe, updateRecipe } from '$lib/server/recipes';

export const GET = async ({ locals, params }) => {
	const recipe = await getRecipe(locals.user.id, params.id);
	return json({ recipe });
};

export const PATCH = async ({ locals, params, request }) => {
	const body = await request.json();
	const recipe = await updateRecipe(locals.user.id, params.id, body);
	return json({ recipe });
};

export const DELETE = async ({ locals, params }) => {
	await deleteRecipe(locals.user.id, params.id);
	return new Response(null, { status: 204 });
};
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/server/recipes-mapping.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/server/recipes.ts src/routes/api/recipes/[id]/+server.ts tests/server/recipes-mapping.test.ts
git commit -m "feat: add recipe detail API"
```

---

## Task 5: Recipe Builder UI

**Files:**
- Create: `src/lib/components/recipes/RecipeForm.svelte`
- Create: `src/lib/components/recipes/IngredientRow.svelte`
- Create: `src/routes/app/recipes/+page.svelte`
- Create: `tests/utils/recipe-builder.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { buildRecipePayload } from '../../src/lib/utils/recipe-builder';

describe('buildRecipePayload', () => {
	test('creates payload from form state', () => {
		const payload = buildRecipePayload({ name: 'Shake', totalServings: 2, ingredients: [] });
		expect(payload.name).toBe('Shake');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/utils/recipe-builder.test.ts`
Expected: FAIL with “Cannot find module …/recipe-builder”

**Step 3: Write minimal implementation**

Create `src/lib/utils/recipe-builder.ts`:
```ts
export const buildRecipePayload = (state: {
	name: string;
	totalServings: number;
	ingredients: Array<{ foodId: string; quantity: number; servingUnit: string }>;
}) => ({
	name: state.name,
	totalServings: state.totalServings,
	ingredients: state.ingredients
});
```

Create `src/lib/components/recipes/IngredientRow.svelte`:
```svelte
<script lang="ts">
	export let ingredient: { foodId: string; quantity: number; servingUnit: string };
	export let foods: Array<{ id: string; name: string }> = [];
</script>

<div class="grid grid-cols-3 gap-2">
	<select class="rounded border p-2" bind:value={ingredient.foodId}>
		<option value="">Select food</option>
		{#each foods as food}
			<option value={food.id}>{food.name}</option>
		{/each}
	</select>
	<input class="rounded border p-2" type="number" placeholder="Qty" bind:value={ingredient.quantity} />
	<input class="rounded border p-2" placeholder="Unit" bind:value={ingredient.servingUnit} />
</div>
```

Create `src/lib/components/recipes/RecipeForm.svelte`:
```svelte
<script lang="ts">
	import IngredientRow from './IngredientRow.svelte';
	import { buildRecipePayload } from '$lib/utils/recipe-builder';

	export let foods: Array<{ id: string; name: string }> = [];
	let state = { name: '', totalServings: 1, ingredients: [{ foodId: '', quantity: 1, servingUnit: 'g' }] };

	export let onSave: (payload: ReturnType<typeof buildRecipePayload>) => void;

	const addIngredient = () => {
		state.ingredients = [...state.ingredients, { foodId: '', quantity: 1, servingUnit: 'g' }];
	};
</script>

<div class="space-y-4">
	<input class="rounded border p-2" placeholder="Recipe name" bind:value={state.name} />
	<input class="rounded border p-2" type="number" placeholder="Total servings" bind:value={state.totalServings} />
	<div class="space-y-2">
		{#each state.ingredients as ingredient}
			<IngredientRow {ingredient} {foods} />
		{/each}
	</div>
	<button class="rounded border px-3 py-1" on:click={addIngredient}>Add ingredient</button>
	<button class="rounded bg-black px-4 py-2 text-white" on:click={() => onSave(buildRecipePayload(state))}>Save recipe</button>
</div>
```

Create `src/routes/app/recipes/+page.svelte`:
```svelte
<script lang="ts">
	import RecipeForm from '$lib/components/recipes/RecipeForm.svelte';
	let foods: Array<any> = [];
	let recipes: Array<any> = [];

	const loadFoods = async () => {
		foods = (await (await fetch('/api/foods')).json()).foods;
	};
	const loadRecipes = async () => {
		recipes = (await (await fetch('/api/recipes')).json()).recipes;
	};
	const createRecipe = async (payload: any) => {
		await fetch('/api/recipes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
		await loadRecipes();
	};

	loadFoods();
	loadRecipes();
</script>

<div class="mx-auto max-w-4xl space-y-6 p-6">
	<h1 class="text-2xl font-semibold">Recipes</h1>
	<RecipeForm {foods} onSave={createRecipe} />
	<ul class="space-y-2">
		{#each recipes as recipe}
			<li class="rounded border p-3">{recipe.name}</li>
		{/each}
	</ul>
</div>
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/utils/recipe-builder.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/components/recipes src/lib/utils/recipe-builder.ts src/routes/app/recipes/+page.svelte tests/utils/recipe-builder.test.ts
git commit -m "feat: add recipe builder UI"
```

---

## Task 6: Log Recipe Entries in Dashboard

**Files:**
- Modify: `src/lib/components/entries/AddFoodModal.svelte`
- Modify: `src/routes/app/+page.svelte`
- Create: `tests/utils/recipe-entry.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { toEntryPayload } from '../../src/lib/utils/recipe-entry';

describe('toEntryPayload', () => {
	test('maps recipe entry to payload', () => {
		const payload = toEntryPayload({ recipeId: 'r1', mealType: 'Dinner', servings: 2 });
		expect(payload.recipeId).toBe('r1');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/utils/recipe-entry.test.ts`
Expected: FAIL with “Cannot find module …/recipe-entry”

**Step 3: Write minimal implementation**

Create `src/lib/utils/recipe-entry.ts`:
```ts
export const toEntryPayload = (input: { recipeId: string; mealType: string; servings: number }) => ({
	recipeId: input.recipeId,
	mealType: input.mealType,
	servings: input.servings
});
```

Modify `src/lib/components/entries/AddFoodModal.svelte` to add a “Recipes” tab that lists recipes and posts `{ recipeId, mealType, servings }` to `/api/entries`.

Modify `src/routes/app/+page.svelte` to render recipe entries by showing the recipe name from the entry payload.

**Step 4: Run test to verify it passes**

Run: `bun test tests/utils/recipe-entry.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/utils/recipe-entry.ts src/lib/components/entries/AddFoodModal.svelte src/routes/app/+page.svelte tests/utils/recipe-entry.test.ts
git commit -m "feat: log recipes from dashboard"
```
