# Goals Page Slider Redesign

## Problem

The current goals page uses independent number inputs for calories, protein, carbs, fat, and fiber. Users can enter values that are physically impossible (e.g. 2204 kcal with 150g protein + 220g carbs + 200g fat = 3280 kcal). There is no feedback about whether macros are consistent with the calorie goal.

## Design

### Shared Utility: `src/lib/utils/nutrition.ts`

Add calorie-per-gram constants and conversion helpers to the existing nutrition utility:

```ts
export const KCAL_PER_GRAM = { protein: 4, carbs: 4, fat: 9 } as const;

export function gramsFromPct(
	calories: number,
	pct: number,
	macro: keyof typeof KCAL_PER_GRAM
): number {
	return Math.round((calories * pct) / 100 / KCAL_PER_GRAM[macro]);
}

export function pctFromGrams(
	calories: number,
	grams: number,
	macro: keyof typeof KCAL_PER_GRAM
): number {
	if (calories <= 0) return 0;
	return Math.round((((grams * KCAL_PER_GRAM[macro]) / calories) * 100) / 5) * 5; // snap to 5% increments
}

export function kcalFromPct(calories: number, pct: number): number {
	return Math.round((calories * pct) / 100);
}
```

### Goals Page UI

**Layout (top to bottom):**

1. **Calories** — number input, min 500, max 10000. This is the anchor value.

2. **Macro Sliders** — three independent sliders inside a card:
   - **Protein**: slider 0–80%, step 5%. Label shows `Protein: X% — Yg (Z kcal)`
   - **Carbs**: slider 0–80%, step 5%. Label shows same format.
   - **Fat**: slider 0–80%, step 5%. Label shows same format.
   - Each slider uses the project color coding: Protein=Red, Carbs=Orange, Fat=Yellow.

3. **Summary bar** — shows total percentage:
   - `100%` in green with checkmark — macros are balanced
   - `X%` in red — save disabled, shows hint "Must equal 100%"

4. **Fat warning** — if fat < 15%, show subtle muted warning about essential dietary fat needs.

5. **Fiber** — number input, unchanged from current design.

6. **Save button** — disabled when macro percentages != 100%.

### Slider Behavior

- All three sliders are fully independent — dragging one does NOT auto-adjust others.
- The sum can temporarily exceed or fall below 100%.
- Save is only enabled at exactly 100%.
- This avoids the frustration of auto-adjusting sliders fighting the user.

### Persistence

- API stores gram values (no schema change needed).
- On **load**: convert stored grams → percentages using `pctFromGrams()` (snapped to nearest 5%).
- On **save**: convert percentages → grams using `gramsFromPct()`, send to API as before.
- Rounding to 5% increments means loaded values may differ slightly from what was stored — this is acceptable since the sliders use 5% steps.

### i18n

New message keys needed:

- `goals_macro_total` — "Total: {pct}%"
- `goals_macro_must_equal_100` — "Must equal 100%"
- `goals_macro_balanced` — "Balanced"
- `goals_fat_warning` — "Fat below 15% may be insufficient for health"
- `goals_macro_detail` — "{pct}% — {grams}g ({kcal} kcal)"

Update existing keys to remove "(g)" suffix since grams are now shown inline with the slider.

## Files Changed

1. `src/lib/utils/nutrition.ts` — add `KCAL_PER_GRAM`, `gramsFromPct`, `pctFromGrams`, `kcalFromPct`
2. `src/routes/(app)/goals/+page.svelte` — replace macro inputs with sliders + summary bar
3. `messages/en.json` — add new i18n keys
4. `messages/de.json` — add German translations
