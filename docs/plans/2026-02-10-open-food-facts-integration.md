# Open Food Facts Integration with Quality Display

## Context

When users scan a barcode that isn't in their local food database, they currently must manually enter all nutritional data. By integrating **Open Food Facts** (the same open database Yuka was originally built on), we can:
1. Auto-populate food data from barcode scans
2. Display Yuka-style quality information: **Nutri-Score** (A-E), **NOVA group** (1-4 processing level), and **additives with risk levels**
3. Enrich existing manually-created foods with quality data

Open Food Facts API: `GET https://world.openfoodfacts.net/api/v2/product/{barcode}` — free, no auth needed.

## Background: Yuka's Approach

Yuka scores food products based on three factors:
- **60% Nutri-Score** — based on sugar, sodium, saturated fat, calories, protein, fiber, fruit/veg content
- **30% Additives** — each additive rated from risk-free to high-risk (based on EFSA/IARC research)
- **10% Organic certification** bonus

Yuka was originally built on Open Food Facts data. We use the same source, which provides Nutri-Score, NOVA groups, and additive information directly via their API.

---

## Implementation Steps

### Step 1: Extend Database Schema

**File:** `src/lib/server/schema.ts` (foods table, after line 73)

Add columns:
- `nutriScore` (text, nullable) — letter a-e
- `novaGroup` (integer, nullable) — 1-4
- `additives` (text array, nullable) — e.g. `["en:e322"]`
- `ingredientsText` (text, nullable)
- `imageUrl` (text, nullable)

Then run `bun run db:generate && bun run db:push`

### Step 2: Update Validation & CRUD

**File:** `src/lib/server/validation/foods.ts`
- Add `nutriScore`, `novaGroup`, `additives`, `ingredientsText`, `imageUrl` to `foodCreateSchema`

**File:** `src/lib/server/foods.ts`
- Add the new fields to `toFoodInsert()` (line 8-30)
- Add `nutriScore`, `novaGroup` etc. to `toFoodUpdate()` (line 61-65)

### Step 3: Create Open Food Facts API Service

**New file:** `src/lib/server/openfoodfacts.ts`
- `fetchProduct(barcode)` function that calls the OFF API
- Validate response with Zod
- Normalize to our data model (per-100g, sodium g→mg conversion)
- Include `User-Agent: Bissbilanz/1.0` header (required by OFF terms)

### Step 4: Create Server API Route

**New file:** `src/routes/api/openfoodfacts/[barcode]/+server.ts`
- `GET` handler: auth check → validate barcode → call `fetchProduct()` → return normalized data
- Server-side proxy avoids CORS issues

### Step 5: Create Additives Risk Mapping

**New file:** `src/lib/utils/additives.ts`
- Static map of ~50 common additive codes → `{ name, risk: 'low' | 'moderate' | 'high' }`
- `getAdditiveInfo(tag)` function with 'unknown' fallback
- `getRiskColor(risk)` for Tailwind classes

### Step 6: Create Quality Display Components

**New files in `src/lib/components/quality/`:**

1. **`NutriScoreBadge.svelte`** — Five letter badges (A-E), active one highlighted+larger, color-coded (green→red)
2. **`NovaGroupBadge.svelte`** — Numbered circle (1-4) with color + label (Unprocessed → Ultra-processed)
3. **`AdditivesList.svelte`** — Color-coded additive badges, sorted by risk (high first), compact and full modes
4. **`FoodQualityPanel.svelte`** — Card combining all three, with optional ingredients text. Only renders if quality data exists.

### Step 7: Integrate into Barcode Scan Flow

**File:** `src/routes/app/foods/new/+page.svelte`
- When `?barcode=` param exists, auto-fetch from `/api/openfoodfacts/{barcode}`
- Show loading state while fetching
- Pre-fill FoodForm with OFF data (name, brand, macros, advanced nutrients)
- Display `FoodQualityPanel` above the form showing Nutri-Score, NOVA, additives
- Pass quality fields through to `POST /api/foods` on save

**File:** `src/lib/components/foods/FoodForm.svelte`
- Extend props/state to accept and forward quality fields (hidden, not user-editable)

### Step 8: Enrich Existing Foods

**File:** `src/lib/components/foods/FoodList.svelte`
- Extend `Props.foods` type to include `barcode`, `nutriScore`
- For foods with barcode but no `nutriScore`: show "Enrich" button
- On click: fetch from OFF API → PATCH food with quality data
- For foods with `nutriScore`: show compact `NutriScoreBadge` inline

### Step 9: Add i18n Messages

**Files:** `messages/en.json`, `messages/de.json`, `messages/fr.json`, `messages/it.json`
- Add keys for: quality panel title, Nutri-Score, NOVA labels, additives, risk levels, enrich button, loading/not-found states

---

## Critical Files

| File | Action |
|------|--------|
| `src/lib/server/schema.ts` | Extend foods table |
| `src/lib/server/validation/foods.ts` | Add quality field validation |
| `src/lib/server/foods.ts` | Update CRUD helpers |
| `src/lib/server/openfoodfacts.ts` | **New** — OFF API client |
| `src/routes/api/openfoodfacts/[barcode]/+server.ts` | **New** — API proxy route |
| `src/lib/utils/additives.ts` | **New** — Additive risk mapping |
| `src/lib/components/quality/*.svelte` | **New** — 4 display components |
| `src/routes/app/foods/new/+page.svelte` | Wire OFF lookup into scan flow |
| `src/lib/components/foods/FoodForm.svelte` | Pass through quality fields |
| `src/lib/components/foods/FoodList.svelte` | Add enrich + inline badges |
| `messages/{en,de,fr,it}.json` | i18n strings |

## Verification

1. **Schema migration**: Run `bun run db:generate && bun run db:push`, verify new columns with `bun run db:studio`
2. **OFF API proxy**: `curl http://localhost:5173/api/openfoodfacts/3017624010701` (Nutella) — should return name, macros, nutriScore, novaGroup, additives
3. **Barcode scan flow**: Scan a barcode → verify form pre-fills with OFF data + quality panel shows above form
4. **Enrich flow**: Create a food manually with a barcode → go to food list → click "Enrich" → verify quality data appears
5. **Partial data**: Test with a barcode that has incomplete OFF data → verify graceful degradation (only show available badges)
6. **Type check**: `bun run check` passes

## Sources

- [How was the database created? - Yuka Help](https://help.yuka.io/l/en/article/5a4z64amnk-how-was-the-database-created)
- [How are food products rated? - Yuka Help](https://help.yuka.io/l/en/article/ijzgfvi1jq-how-are-food-products-scored)
- [Open Food Facts API Documentation](https://openfoodfacts.github.io/openfoodfacts-server/api/)
- [Open Food Facts API Tutorial](https://openfoodfacts.github.io/openfoodfacts-server/api/tutorial-off-api/)
- [Open Food Facts Data](https://world.openfoodfacts.org/data)
