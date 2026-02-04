# Phase 9: Advanced Nutrients (Optional) - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add optional advanced nutrient tracking with settings toggle and expanded goals/stats.

**Architecture:** Extend the `foods` and `userGoals` schema with additional nutrient columns, update validation, and conditionally render advanced sections based on a user preference.

**Tech Stack:** SvelteKit 2.x, Svelte 5, Bun, Drizzle ORM, PostgreSQL

---

## Task 1: Extend Database Schema

**Files:**
- Modify: `src/lib/server/schema.ts`
- Modify: `drizzle.config.ts`
- Create: `drizzle/XXXX_add_advanced_nutrients.sql`
- Create: `src/lib/utils/nutrients.ts`
- Create: `tests/utils/nutrients.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { advancedNutrients } from '../../src/lib/utils/nutrients';

describe('advancedNutrients', () => {
	test('includes sodium and sugar', () => {
		expect(advancedNutrients).toContain('sodium');
		expect(advancedNutrients).toContain('sugar');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/utils/nutrients.test.ts`
Expected: FAIL with “Cannot find module …/nutrients”

**Step 3: Write minimal implementation**

Create `src/lib/utils/nutrients.ts`:
```ts
export const advancedNutrients = [
	'sodium',
	'sugar',
	'saturatedFat',
	'transFat',
	'cholesterol',
	'vitaminA',
	'vitaminC',
	'calcium',
	'iron'
] as const;
```

Modify `src/lib/server/schema.ts` to add new nutrient columns on `foods` and `userGoals` (use `real` columns, nullable for foods, optional for goals).

Create a migration file `drizzle/XXXX_add_advanced_nutrients.sql` with the `ALTER TABLE` statements for `foods` and `user_goals`.

**Step 4: Run test to verify it passes**

Run: `bun test tests/utils/nutrients.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/utils/nutrients.ts src/lib/server/schema.ts drizzle/XXXX_add_advanced_nutrients.sql tests/utils/nutrients.test.ts
git commit -m "feat: add advanced nutrient columns"
```

---

## Task 2: Validation + Goal Updates

**Files:**
- Modify: `src/lib/server/validation/foods.ts`
- Modify: `src/lib/server/validation/goals.ts`
- Create: `tests/utils/nutrients-validation.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { foodCreateSchema } from '../../src/lib/server/validation';

describe('foodCreateSchema advanced nutrients', () => {
	test('accepts sodium', () => {
		const result = foodCreateSchema.safeParse({
			name: 'Soup',
			servingSize: 250,
			servingUnit: 'ml',
			calories: 100,
			protein: 5,
			carbs: 10,
			fat: 2,
			fiber: 1,
			sodium: 400
		});
		expect(result.success).toBe(true);
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/utils/nutrients-validation.test.ts`
Expected: FAIL with “sodium is not allowed”

**Step 3: Write minimal implementation**

Update `src/lib/server/validation/foods.ts`:
```ts
// Add optional advanced nutrients to schema
sodium: z.coerce.number().optional(),
sugar: z.coerce.number().optional(),
saturatedFat: z.coerce.number().optional(),
transFat: z.coerce.number().optional(),
cholesterol: z.coerce.number().optional(),
vitaminA: z.coerce.number().optional(),
vitaminC: z.coerce.number().optional(),
calcium: z.coerce.number().optional(),
iron: z.coerce.number().optional()
```

Update `src/lib/server/validation/goals.ts` similarly for goal fields (optional and nullable).

**Step 4: Run test to verify it passes**

Run: `bun test tests/utils/nutrients-validation.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/server/validation/foods.ts src/lib/server/validation/goals.ts tests/utils/nutrients-validation.test.ts
git commit -m "feat: allow advanced nutrient inputs"
```

---

## Task 3: Settings Toggle + Food Form Section

**Files:**
- Create: `src/lib/stores/preferences.svelte.ts`
- Modify: `src/routes/app/settings/+page.svelte`
- Modify: `src/lib/components/foods/FoodForm.svelte`
- Create: `tests/utils/preferences.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { toggleAdvanced } from '../../src/lib/stores/preferences.svelte';

describe('toggleAdvanced', () => {
	test('toggles advanced nutrients', () => {
		const next = toggleAdvanced(false);
		expect(next).toBe(true);
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/utils/preferences.test.ts`
Expected: FAIL with “Cannot find module …/preferences.svelte”

**Step 3: Write minimal implementation**

Create `src/lib/stores/preferences.svelte.ts`:
```ts
let showAdvanced = false;

export const toggleAdvanced = (current: boolean) => !current;
export const getShowAdvanced = () => showAdvanced;
export const setShowAdvanced = (next: boolean) => {
	showAdvanced = next;
};
```

Modify `src/routes/app/settings/+page.svelte` to add a checkbox for “Show advanced nutrients” that updates the preference store.

Modify `src/lib/components/foods/FoodForm.svelte` to render an “Advanced Nutrients” section when `showAdvanced` is true.

**Step 4: Run test to verify it passes**

Run: `bun test tests/utils/preferences.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/stores/preferences.svelte.ts src/routes/app/settings/+page.svelte src/lib/components/foods/FoodForm.svelte tests/utils/preferences.test.ts
git commit -m "feat: add advanced nutrients toggle"
```

---

## Task 4: Dashboard + Stats Expansion

**Files:**
- Modify: `src/lib/utils/nutrition.ts`
- Modify: `src/routes/app/+page.svelte`
- Modify: `src/routes/app/history/+page.svelte`
- Create: `tests/utils/nutrient-totals.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { calculateAdvancedTotals } from '../../src/lib/utils/nutrition';

describe('calculateAdvancedTotals', () => {
	test('sums advanced nutrients', () => {
		const totals = calculateAdvancedTotals([{ sodium: 10 }, { sodium: 5 }]);
		expect(totals.sodium).toBe(15);
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/utils/nutrient-totals.test.ts`
Expected: FAIL with “calculateAdvancedTotals is not exported”

**Step 3: Write minimal implementation**

Update `src/lib/utils/nutrition.ts`:
```ts
export const calculateAdvancedTotals = (entries: Array<Record<string, number | undefined>>) => {
	return entries.reduce<Record<string, number>>((acc, entry) => {
		for (const [key, value] of Object.entries(entry)) {
			acc[key] = (acc[key] ?? 0) + (value ?? 0);
		}
		return acc;
	}, {});
};
```

Modify `src/routes/app/+page.svelte` and `src/routes/app/history/+page.svelte` to conditionally render advanced nutrient totals and progress bars when `showAdvanced` is enabled.

**Step 4: Run test to verify it passes**

Run: `bun test tests/utils/nutrient-totals.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/utils/nutrition.ts src/routes/app/+page.svelte src/routes/app/history/+page.svelte tests/utils/nutrient-totals.test.ts
git commit -m "feat: add advanced nutrient totals"
```
