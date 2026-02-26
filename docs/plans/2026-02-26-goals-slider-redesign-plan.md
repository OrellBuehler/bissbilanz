# Goals Page Slider Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace independent macro number inputs on the goals page with percentage sliders that must sum to 100%, making it impossible to save inconsistent macro goals.

**Architecture:** Add macro conversion helpers to the existing `nutrition.ts` utility. Redesign the goals page to use shadcn Slider components for protein/carbs/fat as percentages of calories, with a summary bar enforcing the 100% constraint. The API stores grams — we convert on load/save.

**Tech Stack:** SvelteKit, shadcn-svelte Slider, Tailwind CSS, Bun test runner

---

### Task 1: Add macro conversion utilities

**Files:**
- Modify: `src/lib/utils/nutrition.ts`
- Test: `tests/utils/nutrition.test.ts`

**Step 1: Write failing tests**

Add to `tests/utils/nutrition.test.ts`:

```ts
import {
	calculateDailyTotals,
	calculateEntryTotals,
	KCAL_PER_GRAM,
	gramsFromPct,
	pctFromGrams,
	kcalFromPct
} from '../../src/lib/utils/nutrition';

describe('macro conversion utilities', () => {
	test('KCAL_PER_GRAM has correct values', () => {
		expect(KCAL_PER_GRAM.protein).toBe(4);
		expect(KCAL_PER_GRAM.carbs).toBe(4);
		expect(KCAL_PER_GRAM.fat).toBe(9);
	});

	test('gramsFromPct converts percentage to grams', () => {
		// 30% of 2000 kcal protein = 600 kcal / 4 = 150g
		expect(gramsFromPct(2000, 30, 'protein')).toBe(150);
		// 40% of 2000 kcal carbs = 800 kcal / 4 = 200g
		expect(gramsFromPct(2000, 40, 'carbs')).toBe(200);
		// 30% of 2000 kcal fat = 600 kcal / 9 = 67g
		expect(gramsFromPct(2000, 30, 'fat')).toBe(67);
	});

	test('pctFromGrams converts grams to nearest 5%', () => {
		// 150g protein * 4 = 600 kcal / 2000 = 30%
		expect(pctFromGrams(2000, 150, 'protein')).toBe(30);
		// 200g carbs * 4 = 800 kcal / 2000 = 40%
		expect(pctFromGrams(2000, 200, 'carbs')).toBe(40);
		// 67g fat * 9 = 603 kcal / 2000 = 30.15% → snaps to 30%
		expect(pctFromGrams(2000, 67, 'fat')).toBe(30);
	});

	test('pctFromGrams returns 0 when calories is 0', () => {
		expect(pctFromGrams(0, 150, 'protein')).toBe(0);
	});

	test('kcalFromPct converts percentage to calories', () => {
		expect(kcalFromPct(2000, 30)).toBe(600);
		expect(kcalFromPct(2200, 45)).toBe(990);
	});
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test tests/utils/nutrition.test.ts`
Expected: FAIL — `KCAL_PER_GRAM`, `gramsFromPct`, `pctFromGrams`, `kcalFromPct` not exported

**Step 3: Implement the conversion utilities**

Add to the end of `src/lib/utils/nutrition.ts`:

```ts
export const KCAL_PER_GRAM = { protein: 4, carbs: 4, fat: 9 } as const;

type MacroType = keyof typeof KCAL_PER_GRAM;

export function gramsFromPct(calories: number, pct: number, macro: MacroType): number {
	return Math.round((calories * pct) / 100 / KCAL_PER_GRAM[macro]);
}

export function pctFromGrams(calories: number, grams: number, macro: MacroType): number {
	if (calories <= 0) return 0;
	return Math.round(((grams * KCAL_PER_GRAM[macro]) / calories) * 20) * 5;
}

export function kcalFromPct(calories: number, pct: number): number {
	return Math.round((calories * pct) / 100);
}
```

**Step 4: Run tests to verify they pass**

Run: `bun test tests/utils/nutrition.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```
feat: add macro percentage/gram conversion utilities
```

---

### Task 2: Add i18n messages

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/de.json`

**Step 1: Add English messages**

Add these keys to `messages/en.json`:

```json
"goals_macro_total": "Total: {pct}%",
"goals_macro_must_equal_100": "Must equal 100%",
"goals_macro_balanced": "Balanced",
"goals_fat_warning": "Fat below 15% may be too low for health",
"goals_macro_detail": "{pct}% — {grams}g ({kcal} kcal)"
```

Update existing keys — remove "(g)" suffix:
- `"goals_protein": "Protein"`
- `"goals_carbs": "Carbs"`
- `"goals_fat": "Fat"`

**Step 2: Add German messages**

Add these keys to `messages/de.json`:

```json
"goals_macro_total": "Gesamt: {pct}%",
"goals_macro_must_equal_100": "Muss 100% ergeben",
"goals_macro_balanced": "Ausgeglichen",
"goals_fat_warning": "Fett unter 15% kann zu wenig für die Gesundheit sein",
"goals_macro_detail": "{pct}% — {grams}g ({kcal} kcal)"
```

Update existing keys:
- `"goals_protein": "Protein"`
- `"goals_carbs": "Kohlenhydrate"`
- `"goals_fat": "Fett"`

**Step 3: Verify paraglide compiles**

Run: `bun run dev` (briefly, then Ctrl+C) — this triggers the Vite plugin to regenerate paraglide output.
Expected: No errors

**Step 4: Commit**

```
feat: add i18n messages for goals slider redesign
```

---

### Task 3: Redesign the goals page

**Files:**
- Modify: `src/routes/(app)/goals/+page.svelte`

**Step 1: Rewrite the goals page**

Replace the entire content of `src/routes/(app)/goals/+page.svelte` with:

```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Slider } from '$lib/components/ui/slider/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import { toast } from 'svelte-sonner';
	import { apiFetch } from '$lib/utils/api';
	import { gramsFromPct, pctFromGrams, kcalFromPct, KCAL_PER_GRAM } from '$lib/utils/nutrition';
	import * as m from '$lib/paraglide/messages';

	let calorieGoal = $state(2000);
	let proteinPct = $state(30);
	let carbPct = $state(40);
	let fatPct = $state(30);
	let fiberGoal = $state(30);
	let saving = $state(false);
	let loaded = $state(false);

	const totalPct = $derived(proteinPct + carbPct + fatPct);
	const isBalanced = $derived(totalPct === 100);
	const fatTooLow = $derived(fatPct < 15 && fatPct > 0);

	const proteinGrams = $derived(gramsFromPct(calorieGoal, proteinPct, 'protein'));
	const carbGrams = $derived(gramsFromPct(calorieGoal, carbPct, 'carbs'));
	const fatGrams = $derived(gramsFromPct(calorieGoal, fatPct, 'fat'));

	const proteinKcal = $derived(kcalFromPct(calorieGoal, proteinPct));
	const carbKcal = $derived(kcalFromPct(calorieGoal, carbPct));
	const fatKcal = $derived(kcalFromPct(calorieGoal, fatPct));

	onMount(async () => {
		const res = await fetch('/api/goals');
		if (res.ok) {
			const data = await res.json();
			if (data.goals) {
				calorieGoal = data.goals.calorieGoal ?? 2000;
				fiberGoal = data.goals.fiberGoal ?? 30;
				proteinPct = pctFromGrams(calorieGoal, data.goals.proteinGoal ?? 150, 'protein');
				carbPct = pctFromGrams(calorieGoal, data.goals.carbGoal ?? 220, 'carbs');
				fatPct = pctFromGrams(calorieGoal, data.goals.fatGoal ?? 60, 'fat');
			}
		}
		loaded = true;
	});

	const saveGoals = async () => {
		saving = true;
		try {
			const res = await apiFetch('/api/goals', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					calorieGoal,
					proteinGoal: proteinGrams,
					carbGoal: carbGrams,
					fatGoal: fatGrams,
					fiberGoal
				})
			});
			if (res.ok) {
				toast.success(m.goals_saved());
			} else {
				toast.error(m.goals_save_failed());
			}
		} catch {
			toast.error(m.goals_save_failed());
		} finally {
			saving = false;
		}
	};

	const macros = $derived([
		{
			label: m.goals_protein(),
			pct: proteinPct,
			grams: proteinGrams,
			kcal: proteinKcal,
			color: 'red' as const,
			set: (v: number) => (proteinPct = v)
		},
		{
			label: m.goals_carbs(),
			pct: carbPct,
			grams: carbGrams,
			kcal: carbKcal,
			color: 'orange' as const,
			set: (v: number) => (carbPct = v)
		},
		{
			label: m.goals_fat(),
			pct: fatPct,
			grams: fatGrams,
			kcal: fatKcal,
			color: 'yellow' as const,
			set: (v: number) => (fatPct = v)
		}
	]);

	const sliderColorClass: Record<string, string> = {
		red: '[&_[data-slot=slider-range]]:bg-red-500 [&_[data-slot=slider-thumb]]:border-red-500',
		orange:
			'[&_[data-slot=slider-range]]:bg-orange-500 [&_[data-slot=slider-thumb]]:border-orange-500',
		yellow:
			'[&_[data-slot=slider-range]]:bg-yellow-500 [&_[data-slot=slider-thumb]]:border-yellow-500'
	};
</script>

{#if loaded}
	<div class="mx-auto max-w-xl space-y-6">
		<Card.Root>
			<Card.Content class="grid gap-6 pt-6">
				<div class="grid gap-2">
					<Label for="calories">{m.goals_calories()}</Label>
					<Input id="calories" type="number" bind:value={calorieGoal} min="500" max="10000" />
				</div>

				{#each macros as macro}
					<div class="grid gap-2">
						<div class="flex items-center justify-between">
							<Label>{macro.label}</Label>
							<span class="text-xs text-muted-foreground">
								{m.goals_macro_detail({
									pct: String(macro.pct),
									grams: String(macro.grams),
									kcal: String(macro.kcal)
								})}
							</span>
						</div>
						<Slider
							value={[macro.pct]}
							onValueChange={(v) => macro.set(v[0])}
							min={0}
							max={80}
							step={5}
							class={sliderColorClass[macro.color]}
						/>
					</div>
				{/each}

				<div
					class="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium {isBalanced
						? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400'
						: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400'}"
				>
					{#if isBalanced}
						<CircleCheck class="size-4" />
						<span>{m.goals_macro_total({ pct: String(totalPct) })} — {m.goals_macro_balanced()}</span>
					{:else}
						<TriangleAlert class="size-4" />
						<span>{m.goals_macro_total({ pct: String(totalPct) })} — {m.goals_macro_must_equal_100()}</span>
					{/if}
				</div>

				{#if fatTooLow}
					<p class="text-xs text-muted-foreground">{m.goals_fat_warning()}</p>
				{/if}

				<div class="grid gap-2">
					<Label for="fiber">{m.goals_fiber()}</Label>
					<Input id="fiber" type="number" bind:value={fiberGoal} min="0" />
				</div>
			</Card.Content>
			<Card.Footer>
				<Button onclick={saveGoals} disabled={saving || !isBalanced}>
					{saving ? m.goals_saving() : m.goals_save()}
				</Button>
			</Card.Footer>
		</Card.Root>
	</div>
{/if}
```

**Step 2: Start dev server and verify**

Run: `bun run dev`
- Navigate to `/goals`
- Verify sliders render with correct colors
- Verify dragging sliders updates grams/kcal display in real time
- Verify summary bar shows green at 100%, red otherwise
- Verify save is disabled when not 100%
- Verify fat warning appears below 15%
- Verify saving persists correctly (reload page and values are restored)

**Step 3: Run type check**

Run: `bun run check`
Expected: 0 errors

**Step 4: Commit**

```
feat: redesign goals page with macro percentage sliders
```
