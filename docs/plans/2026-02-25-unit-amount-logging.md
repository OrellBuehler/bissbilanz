# Unit Amount Logging Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to log food by unit amount (e.g. 75g) or servings, with live preview showing equivalent values and calories.

**Architecture:** Frontend-only change. No schema or API contract changes. Foods already return `servingSize`/`servingUnit`. The entries query gets two extra columns. A shared `AmountInput` component handles the toggle, conversion, and preview. Both AddFoodModal and EditEntryModal use it.

**Tech Stack:** SvelteKit 2.x, Svelte 5 runes, shadcn-svelte (ToggleGroup, Input, Label), Paraglide i18n

---

### Task 1: Add i18n message keys

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/de.json`

**Step 1: Add English messages**

Add these keys to `messages/en.json` after the `add_food_servings` key:

```json
"amount_input_servings": "Servings",
"amount_input_unit": "Amount",
"amount_input_preview_weight": "= {amount} {unit} · {calories} kcal",
"amount_input_preview_servings": "= {servings} servings · {calories} kcal"
```

**Step 2: Add German messages**

Add these keys to `messages/de.json` after the `add_food_servings` key:

```json
"amount_input_servings": "Portionen",
"amount_input_unit": "Menge",
"amount_input_preview_weight": "= {amount} {unit} · {calories} kcal",
"amount_input_preview_servings": "= {servings} Portionen · {calories} kcal"
```

**Step 3: Commit**

```bash
git add messages/en.json messages/de.json
git commit -m "feat: add i18n keys for amount input with live preview"
```

---

### Task 2: Add servingSize/servingUnit to entries query

**Files:**
- Modify: `src/lib/server/entries.ts` — `listEntriesByDate` function (lines 11-62)

**Step 1: Add servingSize and servingUnit to the select clause**

In `listEntriesByDate`, add two fields to the `.select({...})` object, after the `createdAt` field:

```typescript
servingSize: foods.servingSize,
servingUnit: foods.servingUnit,
```

These come from the already-joined `foods` table. For recipe entries these will be `null` (recipes don't have serving sizes) — that's fine, the UI will hide the toggle for recipes.

**Step 2: Run type checking**

```bash
cd /home/orell/github/bissbilanz && bun run check
```

Expected: PASS (or only pre-existing warnings)

**Step 3: Commit**

```bash
git add src/lib/server/entries.ts
git commit -m "feat: include servingSize and servingUnit in entries query"
```

---

### Task 3: Create the AmountInput component

**Files:**
- Create: `src/lib/components/entries/AmountInput.svelte`

**Step 1: Create the component**

```svelte
<script lang="ts">
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		servings: number;
		servingSize: number | null;
		servingUnit: string | null;
		caloriesPerServing: number | null;
		onServingsChange: (servings: number) => void;
	};

	let { servings, servingSize, servingUnit, caloriesPerServing, onServingsChange }: Props =
		$props();

	let mode: 'servings' | 'unit' = $state('servings');
	let inputValue = $state(servings);

	const hasUnitMode = $derived(
		servingSize != null && servingSize > 0 && servingUnit != null
	);

	$effect(() => {
		if (mode === 'servings') {
			inputValue = servings;
		} else if (servingSize) {
			inputValue = Math.round(servings * servingSize * 10) / 10;
		}
	});

	const handleInput = (value: number) => {
		inputValue = value;
		if (mode === 'servings') {
			onServingsChange(value);
		} else if (servingSize && servingSize > 0) {
			onServingsChange(value / servingSize);
		}
	};

	const handleModeChange = (newMode: string) => {
		if (newMode === 'servings' || newMode === 'unit') {
			const currentServings = mode === 'servings' ? inputValue : servingSize ? inputValue / servingSize : inputValue;
			mode = newMode;
			if (newMode === 'servings') {
				inputValue = Math.round(currentServings * 10) / 10;
			} else if (servingSize) {
				inputValue = Math.round(currentServings * servingSize * 10) / 10;
			}
		}
	};

	const previewText = $derived.by(() => {
		const cal = caloriesPerServing ?? 0;
		const currentServings = mode === 'servings' ? inputValue : servingSize ? inputValue / servingSize : inputValue;
		const totalCalories = Math.round(cal * currentServings);

		if (mode === 'servings' && hasUnitMode) {
			const amount = Math.round(currentServings * (servingSize ?? 0) * 10) / 10;
			return m.amount_input_preview_weight({ amount: String(amount), unit: servingUnit ?? '', calories: String(totalCalories) });
		} else if (mode === 'unit') {
			const s = Math.round(currentServings * 10) / 10;
			return m.amount_input_preview_servings({ servings: String(s), calories: String(totalCalories) });
		}
		return null;
	});

	const unitLabel = $derived.by(() => {
		if (!servingUnit) return '';
		const unitMap: Record<string, () => string> = {
			g: m.food_form_unit_g,
			kg: m.food_form_unit_kg,
			ml: m.food_form_unit_ml,
			l: m.food_form_unit_l,
			oz: m.food_form_unit_oz,
			lb: m.food_form_unit_lb,
			fl_oz: m.food_form_unit_fl_oz,
			cup: m.food_form_unit_cup,
			tbsp: m.food_form_unit_tbsp,
			tsp: m.food_form_unit_tsp
		};
		return unitMap[servingUnit]?.() ?? servingUnit;
	});
</script>

<div class="grid gap-2">
	{#if hasUnitMode}
		<ToggleGroup.Root type="single" value={mode} onValueChange={handleModeChange} class="w-full">
			<ToggleGroup.Item value="servings" class="flex-1 text-xs">
				{m.amount_input_servings()}
			</ToggleGroup.Item>
			<ToggleGroup.Item value="unit" class="flex-1 text-xs">
				{unitLabel}
			</ToggleGroup.Item>
		</ToggleGroup.Root>
	{:else}
		<Label>{m.amount_input_servings()}</Label>
	{/if}

	<Input
		type="number"
		value={inputValue}
		oninput={(e) => handleInput(Number(e.currentTarget.value))}
		min="0.1"
		step={mode === 'unit' ? '1' : '0.1'}
	/>

	{#if previewText}
		<p class="text-xs text-muted-foreground">{previewText}</p>
	{/if}
</div>
```

**Step 2: Verify it compiles**

```bash
cd /home/orell/github/bissbilanz && bun run check
```

Note: Paraglide messages are generated at build time. You may need to run `bun run dev` briefly first to generate the new message functions, then stop it and run check.

**Step 3: Commit**

```bash
git add src/lib/components/entries/AmountInput.svelte
git commit -m "feat: create AmountInput component with servings/unit toggle and live preview"
```

---

### Task 4: Thread serving data through DayLog and update AddFoodModal

**Files:**
- Modify: `src/lib/components/entries/DayLog.svelte` (lines 30, 36-37, 84-91)
- Modify: `src/lib/components/entries/AddFoodModal.svelte`

**Step 1: Update AddFoodModal props and replace servings input**

In `AddFoodModal.svelte`:

1. Add `servingSize` and `servingUnit` to the `foods` prop type (alongside existing fields like `calories`):

```typescript
foods?: Array<{
    id: string;
    name: string;
    isFavorite?: boolean;
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    imageUrl?: string | null;
    servingSize?: number | null;
    servingUnit?: string | null;
}>;
```

2. Import `AmountInput` at the top:

```typescript
import AmountInput from '$lib/components/entries/AmountInput.svelte';
```

3. Add state to track the last-tapped food for preview context:

```typescript
let selectedFoodId: string | null = $state(null);

const selectedFood = $derived(
    foods.find((f) => f.id === selectedFoodId) ?? null
);
```

4. Update `handleAddFood` to also track the selected food:

```typescript
const handleAddFood = (foodId: string) => {
    selectedFoodId = foodId;
    onSave({ foodId, mealType, servings });
};
```

5. Replace the servings `<div class="grid gap-2">` block at the bottom (lines 270-273) with:

```svelte
<AmountInput
    {servings}
    servingSize={selectedFood?.servingSize ?? null}
    servingUnit={selectedFood?.servingUnit ?? null}
    caloriesPerServing={selectedFood?.calories ?? null}
    onServingsChange={(s) => (servings = s)}
/>
```

6. Remove the now-unused `Label` import if it's only used for the servings label.

**Step 2: Update DayLog to pass servingSize/servingUnit to foods prop**

The `foods` array in DayLog is already typed as `Array<any>` and `listFoods` returns all columns including `servingSize` and `servingUnit`. No change needed for the data — it's already there.

**Step 3: Verify**

```bash
cd /home/orell/github/bissbilanz && bun run check
```

**Step 4: Commit**

```bash
git add src/lib/components/entries/AddFoodModal.svelte src/lib/components/entries/DayLog.svelte
git commit -m "feat: use AmountInput in AddFoodModal with serving data"
```

---

### Task 5: Update EditEntryModal with AmountInput

**Files:**
- Modify: `src/lib/components/entries/EditEntryModal.svelte`
- Modify: `src/lib/components/entries/DayLog.svelte`

**Step 1: Extend EditEntryModal entry prop**

In `EditEntryModal.svelte`, update the `entry` type to include serving info:

```typescript
type Props = {
    open?: boolean;
    entry: {
        id: string;
        servings: number;
        mealType: string;
        foodName?: string;
        servingSize?: number | null;
        servingUnit?: string | null;
        calories?: number | null;
    } | null;
    onClose: () => void;
    onSave: (payload: { id: string; servings: number; mealType: string }) => void;
    onDelete: (id: string) => void;
};
```

**Step 2: Import AmountInput and replace servings input**

1. Add import:

```typescript
import AmountInput from '$lib/components/entries/AmountInput.svelte';
```

2. Replace the servings `<div class="grid gap-2">` block (lines 62-65) with:

```svelte
<div class="grid gap-2">
    <AmountInput
        servings={editServings}
        servingSize={entry?.servingSize ?? null}
        servingUnit={entry?.servingUnit ?? null}
        caloriesPerServing={entry?.calories ?? null}
        onServingsChange={(s) => (editServings = s)}
    />
</div>
```

3. Remove the now-unused `Label` import if no longer used elsewhere in the file. Keep `Input` if still used (check — it's not used elsewhere, so remove it too). Actually, the `Label` is still used for the meal select. Keep `Label`, remove `Input` import.

**Step 3: Update DayLog to pass serving info when opening edit modal**

In `DayLog.svelte`, update `openEditModal` and `editingEntry` to include serving data. The `entries` array already has `servingSize`, `servingUnit`, `calories`, and `foodId` from the API.

Update the `editingEntry` type (line 36-37):

```typescript
let editingEntry: {
    id: string;
    servings: number;
    mealType: string;
    foodName?: string;
    servingSize?: number | null;
    servingUnit?: string | null;
    calories?: number | null;
} | null = $state(null);
```

Update `openEditModal` (lines 84-92) to pass the extra fields:

```typescript
const openEditModal = (entry: {
    id: string;
    servings: number;
    mealType: string;
    foodName?: string;
    servingSize?: number | null;
    servingUnit?: string | null;
    calories?: number | null;
}) => {
    editingEntry = entry;
    editModalOpen = true;
};
```

Update `MealSection`'s `onEdit` callback in the template — the `MealSection` component needs to pass `servingSize`, `servingUnit`, `calories` through its `onEdit` callback. Check the MealSection component: its entry type includes `calories` and `servings` but not `servingSize`/`servingUnit`.

Update `MealSection.svelte` Props type to include the new fields in the entries array:

```typescript
entries?: Array<{
    id: string;
    foodName?: string | null;
    calories: number | null;
    servings: number;
    mealType: string;
    createdAt?: string | null;
    servingSize?: number | null;
    servingUnit?: string | null;
}>;
```

Update the `onEdit` callback type in MealSection:

```typescript
onEdit?: (entry: {
    id: string;
    servings: number;
    mealType: string;
    foodName?: string;
    servingSize?: number | null;
    servingUnit?: string | null;
    calories?: number | null;
}) => void;
```

Update the `onEdit` call in MealSection's template (around line 72) to pass the extra fields:

```typescript
onEdit?.({
    id: entry.id,
    servings: entry.servings,
    mealType: entry.mealType,
    foodName: entry.foodName ?? undefined,
    servingSize: entry.servingSize ?? undefined,
    servingUnit: entry.servingUnit ?? undefined,
    calories: entry.calories ?? undefined
})
```

**Step 4: Verify**

```bash
cd /home/orell/github/bissbilanz && bun run check
```

**Step 5: Commit**

```bash
git add src/lib/components/entries/EditEntryModal.svelte src/lib/components/entries/DayLog.svelte src/lib/components/entries/MealSection.svelte
git commit -m "feat: use AmountInput in EditEntryModal with serving data from entries"
```

---

### Task 6: Manual testing and final verification

**Step 1: Start dev server**

```bash
cd /home/orell/github/bissbilanz && bun run dev
```

**Step 2: Test the following scenarios**

1. Open AddFoodModal → servings input should show with toggle (for foods with servingSize/servingUnit)
2. Toggle to unit mode → input changes to unit amount, preview shows equivalent servings + calories
3. Toggle back to servings → values convert correctly
4. Add a food in unit mode → entry is created with correct servings
5. Open EditEntryModal for a food entry → toggle and preview visible
6. Open EditEntryModal for a recipe entry → no toggle shown (servings only)
7. Edit servings in unit mode → save → verify correct value stored

**Step 3: Run type checking**

```bash
cd /home/orell/github/bissbilanz && bun run check
```

**Step 4: Run security scan**

```bash
cd /home/orell/github/bissbilanz && bun run security
```

**Step 5: Final commit if any fixes needed**
