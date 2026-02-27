# Expanded Nutrient Database Design

**Date:** 2026-02-26
**Issue:** #48

## Overview

Expand the food schema from 8 optional nutrients to 45 total nutrients (~37 new), organized into categories. A shared nutrient catalog (`src/lib/nutrients.ts`) serves as the single source of truth — schema, validation, UI, OFF mapping, and MCP all derive from it.

## Nutrient Catalog

Central definition file at `src/lib/nutrients.ts`:

```ts
type NutrientCategory = 'fat_breakdown' | 'sugar_carb' | 'mineral' | 'vitamin' | 'other';

type NutrientDef = {
	key: string; // camelCase (used as TS property name)
	dbColumn: string; // snake_case (DB column name)
	unit: 'g' | 'mg' | 'µg';
	category: NutrientCategory;
	offKey?: string; // Open Food Facts nutriments key
	offConversion?: number; // multiply OFF value (in grams) by this to get our unit
};
```

### Nutrients by Category

**Fat Breakdown** (8 fields — 2 existing + 6 new):

- saturatedFat (g), monounsaturatedFat (g), polyunsaturatedFat (g), transFat (g), omega3 (g), omega6 (g)
- Existing: saturatedFat, cholesterol (mg)

**Sugar & Carb Details** (4 fields — 1 existing + 3 new):

- Existing: sugar (g)
- New: addedSugars (g), sugarAlcohols (g), starch (g)

**Minerals** (15 fields — 3 existing + 12 new):

- Existing: sodium (mg), calcium (mg), iron (mg)
- New: potassium (mg), magnesium (mg), phosphorus (mg), zinc (mg), copper (mg), manganese (mg), selenium (µg), iodine (µg), fluoride (mg), chromium (µg), molybdenum (µg), chloride (mg)

**Vitamins** (13 fields — 2 existing + 11 new):

- Existing: vitaminA (µg), vitaminC (mg)
- New: vitaminD (µg), vitaminE (mg), vitaminK (µg), vitaminB1 (mg), vitaminB2 (mg), vitaminB3 (mg), vitaminB5 (mg), vitaminB6 (mg), vitaminB7 (µg), vitaminB9 (µg), vitaminB12 (µg)

**Other** (5 new fields):

- caffeine (mg), alcohol (g), water (g), taurine (mg), choline (mg), salt (g)

**Total: 45 nutrient fields (8 existing + 37 new)**

### Existing field reclassification

The 8 existing fields (sodium, sugar, saturatedFat, cholesterol, vitaminA, vitaminC, calcium, iron) get integrated into the catalog under their respective categories. No column renames — they keep their current DB column names.

## Database Changes

### Foods table

Add 37 new `real()` nullable columns. Replace the single `foods_optional_nutrition_nonnegative` check constraint with per-category constraints for readability:

- `foods_fat_breakdown_nonneg` — saturatedFat, monounsaturatedFat, polyunsaturatedFat, transFat, omega3, omega6, cholesterol
- `foods_sugar_carb_nonneg` — sugar, addedSugars, sugarAlcohols, starch
- `foods_minerals_nonneg` — all 15 minerals
- `foods_vitamins_nonneg` — all 13 vitamins
- `foods_other_nutrients_nonneg` — caffeine, alcohol, water, taurine, choline, salt

### Goals table

Add optional goal columns for commonly tracked nutrients:

- sodiumGoal, sugarGoal (already exist)
- New: potassiumGoal, calciumGoal, ironGoal, vitaminDGoal, vitaminCGoal, fiberGoal (already tracked as core)

Only add goals for nutrients users commonly set targets for. Not all 45 need goals.

### Migration

Single migration adding all columns. All nullable, no data backfill. Existing data unaffected.

## Validation

Generate Zod fields from the catalog:

```ts
const nutrientFields = Object.fromEntries(
	NUTRIENTS.map((n) => [n.key, z.coerce.number().nonnegative().optional().nullable()])
);
```

Spread into `foodCreateSchema`. Same pattern for goals.

## Food Service

`toFoodInsert` — loop over catalog keys: `input[key] ?? null`.
`toFoodUpdate` — no changes needed (already spreads partial input).

## Open Food Facts

Expand `offProductSchema.nutriments` with all OFF keys from catalog. Map with unit conversions:

- OFF stores everything per 100g in grams
- Minerals in mg: multiply by 1000
- Trace minerals in µg: multiply by 1,000,000
- Vitamins follow same pattern based on target unit

Salt: store as separate field from OFF `salt_100g` (no conversion needed, it's in grams).

## Food Form UI

Collapsible sections by category, all shown but collapsed by default. Auto-expand sections that have data.

```
[Core Macros — always visible, not collapsible]
Calories, Protein, Carbs, Fat, Fiber

▶ Fat Breakdown
▶ Sugar & Carb Details
▶ Minerals
▶ Vitamins
▶ Other

[Quality — existing collapsible section]
```

Each section renders a responsive grid from the catalog. Unit shown as suffix label on each input.

## Food Detail Page

Add same collapsible sections for editing. Only show sections that have at least one non-null value when in read/display mode; all sections visible when editing.

## MCP Server

Expand `create_food` tool schema with all nutrient fields (optional). `get_food` already returns the full food object. Update `update_goals` to accept new goal fields.

## i18n

Add to `messages/en.json` and `messages/de.json`:

- 5 category headers
- 37 new nutrient labels
- Unit abbreviations if not already present

## Design Decisions

1. **Salt + sodium both stored** — more accurate from OFF data
2. **Vitamin A in µg (RAE)** — modern standard, no IU
3. **No DRI percentages** — defer to future enhancement
4. **Catalog-driven** — prevents field drift across layers
5. **Per-category check constraints** — easier to read and maintain than one giant constraint
6. **Goals only for commonly tracked nutrients** — not all 45
