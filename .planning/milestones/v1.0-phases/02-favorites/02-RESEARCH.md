# Phase 2: Favorites - Research

**Researched:** 2026-02-18
**Domain:** Favorites system with image upload, tap-to-log, and reusable card components
**Confidence:** HIGH

## Summary

Phase 2 adds a favorites system to Bissbilanz: users mark foods/recipes as favorites, view them as image-forward cards, and tap to log servings. The codebase already has strong foundations -- `isFavorite` boolean on foods, `onlyFavorites()` utility, favorites tab in AddFoodModal, `showFavoritesWidget` preference toggle, and `svelte-sonner` for toast notifications. The recipes table needs `isFavorite` and `imageUrl` columns added via migration.

The main new work falls into four areas: (1) schema migration + image upload API with sharp, (2) FavoriteCard component with image/placeholder design, (3) favorites page with tabs and ranking by log count, and (4) tap-to-log flow with undo toast on dashboard widget and favorites page.

**Primary recommendation:** Build the FavoriteCard component first as the reusable primitive, then layer the favorites page, dashboard widget, and tap-to-log flow on top. Image upload is an independent vertical that can be built in parallel.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- Image-first card layout: large image area at top, compact info below
- Show all macros on each card: calories, protein, carbs, fat
- Items without an image get a colored placeholder with the food's first letter (like contact avatars)
- No favorite toggle (heart/star) on the card itself -- unfavoriting only from the food/recipe detail view
- 2-column grid on mobile, expanding on wider screens
- Foods and recipes separated by tabs (tab bar to switch between "Foods" and "Recipes" views)
- Empty state: friendly illustration with a "Browse foods" button (CTA linking to food database)
- Dashboard widget uses the same image-first card style as the favorites page (not a compact/mini variant)
- Dashboard widget shows top 5 favorites with tap-to-log
- Upload available from the food/recipe edit page (standard form field) -- not from the card itself
- Both foods and recipes support user-uploaded images
- Uses the browser's native file input (system picker) -- no custom camera/gallery UI
- No client-side crop or editing -- server resizes to 400px WebP automatically via sharp

### Claude's Discretion

- Tap-to-log interaction flow (instant log vs servings picker, "current meal" logic, undo toast behavior)
- Card spacing, typography, and responsive breakpoints
- Color palette for no-image placeholders
- Loading states and error handling
- Exact tab component implementation

### Deferred Ideas (OUT OF SCOPE)

None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>

## Phase Requirements

| ID     | Description                                                                             | Research Support                                                                                                                                                                          |
| ------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FAV-01 | User can mark foods as favorite (toggle isFavorite flag)                                | Already exists: `isFavorite` column on foods, checkbox in FoodForm. Needs: toggle API endpoint (PATCH `/api/foods/:id` already supports partial updates via `foodUpdateSchema.partial()`) |
| FAV-02 | User can mark recipes as favorite (isFavorite + imageUrl columns on recipes)            | Needs: DB migration to add `isFavorite` boolean + `imageUrl` text columns to recipes table. Update `recipeUpdateSchema` to accept these fields                                            |
| FAV-03 | Dedicated favorites page shows all favorites as visual image cards with nutrition info  | Needs: new route `/app/favorites`, new API endpoint to fetch favorites with nutrition data, FavoriteCard component                                                                        |
| FAV-04 | Favorites ranked by log count (most-used items surface first)                           | Needs: SQL query counting foodEntries per food/recipe, ordered by count desc. Drizzle `count()` + `groupBy`                                                                               |
| FAV-05 | Tap-to-log: configurable instant log or choose-servings picker                          | Needs: user preference for tap action, "current meal" time-based logic, servings picker dialog                                                                                            |
| FAV-06 | Dashboard favorites widget shows top 5 with tap-to-log (hideable in settings)           | Already exists: `showFavoritesWidget` preference toggle in settings. Needs: widget component on dashboard using FavoriteCard                                                              |
| FAV-07 | Image upload for recipes via sharp server-side resize to 400px webp                     | Needs: `bun add sharp`, upload API endpoint, file storage strategy, image serving route                                                                                                   |
| FAV-08 | FavoriteCard component reused across favorites page, dashboard widget, and AddFoodModal | Core deliverable: single component with image/placeholder, macro display, tap handler                                                                                                     |
| FAV-09 | Toast notification with undo action after logging from favorites                        | Already exists: svelte-sonner with Toaster mounted. Use `toast()` with `action: { label: 'Undo', onClick }`                                                                               |

</phase_requirements>

## Standard Stack

### Core (already installed)

| Library                 | Version | Purpose                                         | Why Standard                                                   |
| ----------------------- | ------- | ----------------------------------------------- | -------------------------------------------------------------- |
| svelte-sonner           | ^1.0.7  | Toast notifications with action buttons         | Already in use, supports `action: { label, onClick }` for undo |
| shadcn-svelte (bits-ui) | ^2.15.5 | UI components (Tabs, Dialog, Button, Card)      | Already the component library                                  |
| drizzle-orm             | ^0.45.1 | Database queries with count/groupBy for ranking | Already the ORM                                                |
| zod                     | ^4.3.6  | Validation schemas for upload and API input     | Already used throughout                                        |
| tailwind-variants       | ^3.2.2  | Component variant styling                       | Already installed                                              |

### New Dependencies

| Library | Version          | Purpose                                | When to Use             |
| ------- | ---------------- | -------------------------------------- | ----------------------- |
| sharp   | latest (^0.33.x) | Server-side image resize to 400px WebP | Image upload processing |

### Alternatives Considered

| Instead of         | Could Use             | Tradeoff                                                         |
| ------------------ | --------------------- | ---------------------------------------------------------------- |
| sharp              | Bun native image APIs | Bun has no built-in image processing; sharp is the standard      |
| Local file storage | S3/cloud storage      | Local is simpler for single-server deployment; can migrate later |

**Installation:**

```bash
bun add sharp
```

## Architecture Patterns

### New Files Structure

```
src/
├── lib/
│   ├── components/
│   │   └── favorites/
│   │       ├── FavoriteCard.svelte         # FAV-08: reusable card component
│   │       ├── FavoritesGrid.svelte        # Grid layout wrapper
│   │       ├── FavoritesWidget.svelte      # Dashboard widget (top 5)
│   │       └── ServingsPicker.svelte       # Servings dialog for tap-to-log
│   ├── server/
│   │   ├── favorites.ts                    # Favorites queries (ranked list, toggle)
│   │   ├── images.ts                       # Sharp resize + file write logic
│   │   └── validation/
│   │       └── favorites.ts                # (if needed, or extend existing)
│   └── utils/
│       ├── favorites.ts                    # Already exists (onlyFavorites)
│       └── meals.ts                        # Extend: currentMealByTime() helper
├── routes/
│   ├── api/
│   │   ├── favorites/
│   │   │   └── +server.ts                  # GET favorites ranked by log count
│   │   └── images/
│   │       └── upload/+server.ts           # POST image upload (multipart form)
│   ├── app/
│   │   └── favorites/
│   │       └── +page.svelte                # Favorites page
│   └── uploads/
│       └── [filename]/+server.ts           # Serve uploaded images
└── uploads/                                # Image storage directory (gitignored)
```

### Pattern 1: FavoriteCard Component Design

**What:** Single reusable card with image area, placeholder fallback, macro info strip, and tap handler
**When to use:** Favorites page grid, dashboard widget, AddFoodModal favorites tab
**Example:**

```svelte
<!-- FavoriteCard.svelte -->
<script lang="ts">
	type Props = {
		name: string;
		imageUrl?: string | null;
		calories: number;
		protein: number;
		carbs: number;
		fat: number;
		type: 'food' | 'recipe';
		onTap: () => void;
	};
	let { name, imageUrl, calories, protein, carbs, fat, type, onTap }: Props = $props();

	// Deterministic color from name hash for placeholder
	const placeholderColors = [
		'bg-rose-200',
		'bg-sky-200',
		'bg-amber-200',
		'bg-emerald-200',
		'bg-violet-200',
		'bg-orange-200',
		'bg-teal-200',
		'bg-pink-200'
	];
	const colorIndex =
		name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % placeholderColors.length;
</script>

<button class="overflow-hidden rounded-xl border bg-card text-left shadow-sm" onclick={onTap}>
	<!-- Image area -->
	<div class="aspect-[4/3] w-full">
		{#if imageUrl}
			<img src={imageUrl} alt={name} class="h-full w-full object-cover" />
		{:else}
			<div class="flex h-full w-full items-center justify-center {placeholderColors[colorIndex]}">
				<span class="text-3xl font-bold text-white/80">{name[0]?.toUpperCase()}</span>
			</div>
		{/if}
	</div>
	<!-- Info area -->
	<div class="p-2">
		<p class="truncate text-sm font-medium">{name}</p>
		<div class="mt-1 flex gap-2 text-xs text-muted-foreground">
			<span class="text-blue-600">{calories} kcal</span>
			<span class="text-red-600">{protein}g P</span>
			<span class="text-orange-600">{carbs}g C</span>
			<span class="text-yellow-600">{fat}g F</span>
		</div>
	</div>
</button>
```

### Pattern 2: Favorites Ranked by Log Count (SQL)

**What:** Query favorites ordered by how many times they appear in foodEntries
**When to use:** Favorites page, dashboard widget (top 5)
**Example:**

```typescript
// Server-side: favorites.ts
import { foods, foodEntries, recipes } from '$lib/server/schema';
import { eq, and, desc, sql, count } from 'drizzle-orm';

export const listFavoriteFoods = async (userId: string, limit?: number) => {
	const db = getDB();
	return db
		.select({
			id: foods.id,
			name: foods.name,
			imageUrl: foods.imageUrl,
			calories: foods.calories,
			protein: foods.protein,
			carbs: foods.carbs,
			fat: foods.fat,
			fiber: foods.fiber,
			logCount: count(foodEntries.id).as('log_count')
		})
		.from(foods)
		.leftJoin(foodEntries, eq(foods.id, foodEntries.foodId))
		.where(and(eq(foods.userId, userId), eq(foods.isFavorite, true)))
		.groupBy(foods.id)
		.orderBy(desc(sql`log_count`))
		.limit(limit ?? 50);
};
```

### Pattern 3: Tap-to-Log with Undo Toast

**What:** Log a food entry, show toast with undo button that DELETEs the entry
**When to use:** Favorites page and dashboard widget tap interactions
**Example:**

```typescript
// Client-side tap-to-log flow
import { toast } from 'svelte-sonner';

const tapToLog = async (item: FavoriteItem) => {
	const currentMeal = getCurrentMealByTime(); // time-based: Breakfast < 11, Lunch < 15, etc.
	const today = new Date().toISOString().split('T')[0];

	const res = await fetch('/api/entries', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			foodId: item.type === 'food' ? item.id : undefined,
			recipeId: item.type === 'recipe' ? item.id : undefined,
			mealType: currentMeal,
			servings: 1,
			date: today
		})
	});
	const { entry } = await res.json();

	toast.success(`Logged ${item.name}`, {
		action: {
			label: 'Undo',
			onClick: async () => {
				await fetch(`/api/entries/${entry.id}`, { method: 'DELETE' });
				// Refresh data
			}
		},
		duration: 5000
	});
};
```

### Pattern 4: Image Upload with Sharp

**What:** Multipart form upload, server resizes to 400px WebP, stores to disk
**When to use:** Food/recipe edit forms
**Example:**

```typescript
// Server-side: images.ts
import sharp from 'sharp';
import { join } from 'path';
import { mkdir, writeFile } from 'fs/promises';

const UPLOAD_DIR = './uploads';
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export const processImage = async (file: File): Promise<string> => {
	const buffer = Buffer.from(await file.arrayBuffer());

	const processed = await sharp(buffer)
		.resize(400, 400, { fit: 'cover', withoutEnlargement: true })
		.webp({ quality: 80 })
		.toBuffer();

	const filename = `${crypto.randomUUID()}.webp`;
	await mkdir(UPLOAD_DIR, { recursive: true });
	await writeFile(join(UPLOAD_DIR, filename), processed);

	return `/uploads/${filename}`;
};
```

### Pattern 5: Current Meal by Time of Day

**What:** Determine which meal type to use based on current time
**When to use:** Tap-to-log default meal selection
**Example:**

```typescript
// utils/meals.ts
export const getCurrentMealByTime = (): string => {
	const hour = new Date().getHours();
	if (hour < 11) return 'Breakfast';
	if (hour < 15) return 'Lunch';
	if (hour < 18) return 'Snacks';
	return 'Dinner';
};
```

### Anti-Patterns to Avoid

- **Storing images in the database:** Use filesystem + URL reference in the DB. Binary blobs in PostgreSQL hurt performance and backup size.
- **Synchronous sharp in request handler:** Sharp is async via libuv and does NOT block the event loop for typical photo sizes (confirmed by sharp docs). Use `await sharp().toBuffer()` normally.
- **Separate card components for different contexts:** The spec requires ONE FavoriteCard reused everywhere (FAV-08). Don't create DashboardCard vs PageCard variants.
- **Client-side image processing:** The decision locks server-side resize via sharp. Don't add client-side cropping libraries.

## Don't Hand-Roll

| Problem                          | Don't Build                   | Use Instead                                   | Why                                                        |
| -------------------------------- | ----------------------------- | --------------------------------------------- | ---------------------------------------------------------- |
| Image resizing/format conversion | Custom canvas/WASM resize     | sharp                                         | Handles EXIF rotation, color space, quality optimization   |
| Toast with undo action           | Custom notification system    | svelte-sonner `toast()` with `action`         | Already mounted, handles auto-dismiss, stacking, animation |
| Tab navigation                   | Custom tab state management   | shadcn-svelte Tabs component                  | Already used in AddFoodModal, consistent behavior          |
| Responsive grid layout           | Custom breakpoint JS          | Tailwind CSS grid utilities                   | `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` handles it     |
| File input                       | Custom drag-and-drop uploader | Native `<input type="file" accept="image/*">` | Decision: use browser's native file input                  |

**Key insight:** This phase is primarily UI composition + one new server capability (image upload). Most building blocks already exist in the codebase.

## Common Pitfalls

### Pitfall 1: Recipe Nutrition Calculation

**What goes wrong:** Recipes don't have direct calorie/protein/etc. columns -- nutrition must be computed from ingredients.
**Why it happens:** Foods have macro columns directly, but recipes only have ingredients with quantities.
**How to avoid:** The favorites API must join recipes -> recipeIngredients -> foods, sum the macros, and divide by totalServings to get per-serving nutrition. This computation should happen server-side.
**Warning signs:** FavoriteCard showing 0 calories for recipes.

### Pitfall 2: Image Upload File Size on Mobile

**What goes wrong:** Modern phone photos are 5-12MB. Without limits, uploads are slow and memory-heavy.
**Why it happens:** Users take photos with high-resolution cameras.
**How to avoid:** Set a 10MB upload limit in the API route. Sharp handles large inputs efficiently (streams via libvips, not full decode to memory).
**Warning signs:** Slow uploads, server memory spikes.

### Pitfall 3: Missing Uploads Directory in Production

**What goes wrong:** The `./uploads` directory doesn't exist in fresh deployments or Docker containers.
**Why it happens:** It's not tracked in git and Docker builds start from a clean image.
**How to avoid:** Use `mkdir -p` / `recursive: true` when writing. Also ensure the uploads path is configurable via env var and potentially uses a Docker volume mount.
**Warning signs:** ENOENT errors on first image upload.

### Pitfall 4: Race Condition in Undo Flow

**What goes wrong:** User taps "Undo" but the entry was already included in a dashboard refresh.
**Why it happens:** Dashboard reload happens after logging, then undo deletes the entry.
**How to avoid:** After undo, trigger a data refresh. The undo onClick callback should call the same reload function. Keep it optimistic -- delete on server, then refresh UI.
**Warning signs:** Stale entry counts after undo.

### Pitfall 5: Favorites Count Includes Deleted Entries

**What goes wrong:** Log count ranking counts entries that were later deleted via undo.
**Why it happens:** Undo deletes the foodEntry row, so the count naturally excludes it. But if there's caching, stale counts persist.
**How to avoid:** Always query log count fresh (no client-side caching of counts). The leftJoin + count pattern automatically reflects current state.

### Pitfall 6: Food imageUrl vs Upload imageUrl Collision

**What goes wrong:** Foods already have an `imageUrl` field used by Open Food Facts data (external URLs).
**Why it happens:** The existing schema uses `imageUrl` for OFF product images.
**How to avoid:** The same `imageUrl` column can serve both purposes -- it stores either an external URL (OFF) or a local path (`/uploads/xxx.webp`). The upload API should set this column. Image serving must handle both external URLs (passthrough) and local paths.
**Warning signs:** Card showing broken images because it tries to load an external URL as a local path.

## Code Examples

### Current Meal Detection

```typescript
// src/lib/utils/meals.ts (extend existing file)
export const getCurrentMealByTime = (): string => {
	const hour = new Date().getHours();
	if (hour < 11) return 'Breakfast';
	if (hour < 15) return 'Lunch';
	if (hour < 18) return 'Snacks';
	return 'Dinner';
};
```

### svelte-sonner Toast with Undo Action

```typescript
// Source: svelte-sonner README + codebase pattern (src/lib/stores/toast.svelte.ts)
import { toast } from 'svelte-sonner';

toast.success('Logged Chicken Breast to Lunch', {
	action: {
		label: 'Undo',
		onClick: async () => {
			await fetch(`/api/entries/${entryId}`, { method: 'DELETE' });
			await refreshData();
		}
	},
	duration: 5000 // 5 seconds to undo
});
```

### Drizzle Migration for Recipes isFavorite + imageUrl

```sql
-- Add isFavorite and imageUrl to recipes table
ALTER TABLE "recipes" ADD COLUMN "is_favorite" boolean NOT NULL DEFAULT false;
ALTER TABLE "recipes" ADD COLUMN "image_url" text;
```

### Sharp Image Processing (Non-blocking)

```typescript
// Source: sharp official docs (sharp.pixelplumbing.com)
import sharp from 'sharp';

// This is async and non-blocking via libuv -- does NOT block the Bun event loop
const processedBuffer = await sharp(inputBuffer)
	.resize(400, 400, { fit: 'cover', withoutEnlargement: true })
	.webp({ quality: 80 })
	.toBuffer();
```

### Multipart Form Data in SvelteKit API Route

```typescript
// SvelteKit handles multipart natively via request.formData()
export const POST: RequestHandler = async ({ request, locals }) => {
	const userId = requireAuth(locals);
	const formData = await request.formData();
	const file = formData.get('image') as File | null;

	if (!file || !file.type.startsWith('image/')) {
		return json({ error: 'Invalid image file' }, { status: 400 });
	}

	if (file.size > 10 * 1024 * 1024) {
		return json({ error: 'File too large (max 10MB)' }, { status: 400 });
	}

	const imageUrl = await processImage(file);
	return json({ imageUrl }, { status: 201 });
};
```

### Recipe Nutrition Aggregation Query

```typescript
// Compute per-serving nutrition for a recipe by summing ingredients
import { foods, recipeIngredients, recipes } from '$lib/server/schema';
import { eq, sql } from 'drizzle-orm';

export const getRecipeNutrition = async (recipeId: string) => {
	const db = getDB();
	const [result] = await db
		.select({
			totalCalories: sql<number>`SUM(${foods.calories} * ${recipeIngredients.quantity} / ${foods.servingSize})`,
			totalProtein: sql<number>`SUM(${foods.protein} * ${recipeIngredients.quantity} / ${foods.servingSize})`,
			totalCarbs: sql<number>`SUM(${foods.carbs} * ${recipeIngredients.quantity} / ${foods.servingSize})`,
			totalFat: sql<number>`SUM(${foods.fat} * ${recipeIngredients.quantity} / ${foods.servingSize})`,
			totalServings: recipes.totalServings
		})
		.from(recipeIngredients)
		.innerJoin(foods, eq(recipeIngredients.foodId, foods.id))
		.innerJoin(recipes, eq(recipeIngredients.recipeId, recipes.id))
		.where(eq(recipeIngredients.recipeId, recipeId))
		.groupBy(recipes.id);

	if (!result) return null;
	const s = result.totalServings;
	return {
		calories: Math.round((result.totalCalories ?? 0) / s),
		protein: Math.round(((result.totalProtein ?? 0) / s) * 10) / 10,
		carbs: Math.round(((result.totalCarbs ?? 0) / s) * 10) / 10,
		fat: Math.round(((result.totalFat ?? 0) / s) * 10) / 10
	};
};
```

## State of the Art

| Old Approach             | Current Approach                    | When Changed        | Impact                                   |
| ------------------------ | ----------------------------------- | ------------------- | ---------------------------------------- |
| sharp sync API           | sharp async/await (Promise-based)   | sharp 0.30+         | Always use await; non-blocking via libuv |
| Store images in DB blobs | Filesystem + URL reference          | Standard practice   | Better performance, simpler backups      |
| Custom toast components  | svelte-sonner with action callbacks | Already in codebase | Use built-in action support for undo     |

**Confirmed:** sharp works with Bun runtime (supports Node-API v9). No compatibility concerns.

**Confirmed:** sharp's resize operations are non-blocking (uses libuv under the hood). For a typical 5-10MB phone photo resized to 400px WebP, processing takes ~50-200ms and does NOT block the event loop. No need for worker threads or background queues.

## Open Questions

1. **Image storage path in production Docker**
   - What we know: Local filesystem storage works. The upload dir needs to persist across container restarts.
   - What's unclear: Whether the Docker setup uses volumes for data persistence.
   - Recommendation: Use an env var `UPLOAD_DIR` (default `./uploads`), document the Docker volume mount requirement. This is a deployment concern, not a code concern.

2. **Tap-to-log: instant vs servings picker default**
   - What we know: FAV-05 says "configurable" -- user can choose behavior. Current dashboard uses a separate AddFoodModal with servings input.
   - What's unclear: What should the default be for new users.
   - Recommendation: Default to instant (1 serving) for speed. Add a user preference `favoriteTapAction: 'instant' | 'picker'` to `userPreferences`. This needs a schema migration.

3. **Favorites in AddFoodModal upgrade**
   - What we know: AddFoodModal already has a "favorites" tab showing a text list of favorite foods. FAV-08 says FavoriteCard should be reused there.
   - What's unclear: Whether to replace the entire favorites tab with cards, or keep the text list with an option to switch.
   - Recommendation: Replace the text list with FavoriteCard grid in the AddFoodModal favorites tab. This makes the experience consistent.

## Sources

### Primary (HIGH confidence)

- Codebase analysis: `src/lib/server/schema.ts` -- foods already has `isFavorite` and `imageUrl` columns
- Codebase analysis: `src/lib/server/foods.ts` -- `updateFood` already handles partial updates including `isFavorite`
- Codebase analysis: `src/lib/components/entries/AddFoodModal.svelte` -- existing favorites tab
- Codebase analysis: `src/routes/app/settings/+page.svelte` -- existing `showFavoritesWidget` toggle
- Codebase analysis: `src/lib/stores/toast.svelte.ts` -- existing toast helpers

### Secondary (MEDIUM confidence)

- [sharp official docs](https://sharp.pixelplumbing.com/) -- async processing, Bun compatibility, WebP support
- [sharp npm](https://www.npmjs.com/package/sharp) -- current version, Node-API v9 support including Bun
- [svelte-sonner GitHub](https://github.com/wobsoriano/svelte-sonner) -- action button API with onClick callback
- [sonner toast docs](https://sonner.emilkowal.ski/toast) -- action, onDismiss, onAutoClose callbacks

### Tertiary (LOW confidence)

- None -- all findings verified with primary or secondary sources

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH -- all libraries either already installed or well-documented (sharp)
- Architecture: HIGH -- follows existing codebase patterns exactly (API routes, server modules, components)
- Pitfalls: HIGH -- identified from direct codebase analysis (recipe nutrition gap, imageUrl dual use)
- Image upload: HIGH -- sharp confirmed compatible with Bun, async non-blocking confirmed

**Research date:** 2026-02-18
**Valid until:** 2026-03-18 (stable domain, no fast-moving dependencies)
