# Unit Amount Logging with Live Preview

GitHub Issue: #40

## Problem

Users must enter servings (a multiplier) when logging food, but often know the exact weight/volume instead. Mental math (e.g. 75g / 50g per serving = 1.5 servings) is friction.

## Solution

Add a servings/unit toggle to the food logging inputs with live preview. No schema changes — unit amounts are converted to servings before storing.

## Data Flow

Foods already store `servingSize` (number) and `servingUnit` (e.g. 'g'). The conversion is:

- `servings = unitAmount / servingSize`
- `unitAmount = servings * servingSize`
- `previewCalories = food.calories * servings`

## UI Changes

### AddFoodModal

The global servings input at the bottom of the modal gets enhanced:

1. **Toggle** — segmented control: "Servings" | food's unit label (e.g. "Grams")
2. **Input** — in servings mode: number of servings; in unit mode: amount in unit
3. **Preview line** — below the input, shows:
   - Servings mode: "= 150g · 200 kcal" (equivalent weight + calories)
   - Unit mode: "= 1.5 servings · 200 kcal" (equivalent servings + calories)

The preview requires knowing which food is about to be added. Since the current flow adds food immediately on button click, we need to track the "last selected" food or show preview based on the most recently tapped food. Alternative: show preview only after food selection (no preview when no food context).

**Decision:** Show preview only when a food has been selected (tapped). The preview updates reactively as the user changes the input. When no food is contextually known, show just the input without preview.

To track the selected food, change the flow slightly: tapping a food selects it (highlights) rather than immediately adding it. A separate "Add" button confirms the addition. This also lets users adjust servings before adding.

### EditEntryModal

Same toggle + preview pattern. The entry prop is extended with `servingSize`, `servingUnit`, and `calories` so the modal can compute previews.

### Shared Component

Extract an `AmountInput` component used by both modals:

Props:
- `servings` (bindable)
- `servingSize` (number)
- `servingUnit` (string)
- `caloriesPerServing` (number)

The component manages its own input mode state and always exposes the canonical `servings` value to the parent.

## Data Threading

### AddFoodModal

The `foods` prop needs `servingSize` and `servingUnit` added. DayLog.svelte already fetches full food data — just pass these fields through.

### EditEntryModal

The `entry` prop needs `servingSize`, `servingUnit`, and `calories` added. DayLog.svelte has access to the food data and can enrich the entry when opening the edit modal.

## i18n

New message keys needed:
- `amount_input_servings` — "Servings"
- `amount_input_unit` — dynamic, uses existing unit labels
- `amount_input_preview` — "= {amount}{unit} · {calories} kcal" pattern
- `amount_input_preview_servings` — "= {servings} servings · {calories} kcal"

## Edge Cases

- **Recipes:** No `servingSize`/`servingUnit` — always show servings mode, hide toggle
- **servingSize = 0 or null:** Fall back to servings-only mode
- **Very small/large conversions:** Use appropriate decimal places (max 1 for display)

## Scope

- No database schema changes
- No API changes (entries still store `servings`)
- Frontend-only: AmountInput component, AddFoodModal, EditEntryModal, DayLog data threading
