# Favorites Tab & Dashboard Widget Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a dedicated favorites page with visual image cards, a dashboard top-5 widget, image upload for recipes, and configurable tap-to-log behavior.

**Architecture:** Schema changes add `isFavorite`/`imageUrl` to recipes and a new `userPreferences` table. A file upload endpoint saves images to `static/uploads/`. A combined `/api/favorites` endpoint returns favorite foods + recipes ranked by log count. The `FavoriteCard` component is reused across the favorites page, dashboard widget, and AddFoodModal.

**Tech Stack:** SvelteKit 2.x, Svelte 5 runes, Drizzle ORM, PostgreSQL, Tailwind CSS 4.x, shadcn-svelte, sharp (image resize), Zod

---

## Task 1: Schema Changes — Add fields to recipes + new userPreferences table

**Files:**
- Modify: `src/lib/server/schema.ts:137-150` (recipes table)
- Modify: `src/lib/server/schema.ts:287-311` (type exports)

**Step 1: Add `isFavorite` and `imageUrl` to recipes table**

In `src/lib/server/schema.ts`, modify the recipes table (line 137-150) to add two new columns:

```typescript
export const recipes = pgTable(
	'recipes',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		totalServings: real('total_servings').notNull(),
		isFavorite: boolean('is_favorite').default(false),
		imageUrl: text('image_url'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
	},
	(table) => [index('idx_recipes_user_id').on(table.userId)]
);
```

**Step 2: Add userPreferences table**

Add after the `customMealTypes` table (after line 186), before the OAuth tables:

```typescript
// User Preferences
export const userPreferences = pgTable('user_preferences', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id')
		.notNull()
		.unique()
		.references(() => users.id, { onDelete: 'cascade' }),
	showFavoritesOnDashboard: boolean('show_favorites_on_dashboard').default(true),
	favoriteTapAction: text('favorite_tap_action').default('instant'),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
});
```

**Step 3: Add type exports**

Add to the type exports section (after line 302):

```typescript
export type UserPreference = typeof userPreferences.$inferSelect;
export type NewUserPreference = typeof userPreferences.$inferInsert;
```

**Step 4: Generate migration**

Run: `bun run db:generate`
Expected: New migration file created in `drizzle/` folder

**Step 5: Push schema to dev database**

Run: `bun run db:push`
Expected: Schema applied successfully

**Step 6: Commit**

```bash
git add src/lib/server/schema.ts drizzle/
git commit -m "feat: add isFavorite/imageUrl to recipes and userPreferences table"
```

---

## Task 2: Validation Schemas — Preferences and recipe updates

**Files:**
- Create: `src/lib/server/validation/preferences.ts`
- Modify: `src/lib/server/validation/recipes.ts`
- Modify: `src/lib/server/validation/index.ts`

**Step 1: Create preferences validation**

Create `src/lib/server/validation/preferences.ts`:

```typescript
import { z } from 'zod';

export const preferencesUpdateSchema = z.object({
	showFavoritesOnDashboard: z.boolean().optional(),
	favoriteTapAction: z.enum(['instant', 'choose_servings']).optional()
});
```

**Step 2: Update recipe validation to include new fields**

Modify `src/lib/server/validation/recipes.ts` to support `isFavorite` and `imageUrl`:

```typescript
import { z } from 'zod';

export const recipeIngredientSchema = z.object({
	foodId: z.string().uuid(),
	quantity: z.coerce.number().positive(),
	servingUnit: z.string().min(1)
});

export const recipeCreateSchema = z.object({
	name: z.string().min(1),
	totalServings: z.coerce.number().positive(),
	ingredients: z.array(recipeIngredientSchema).min(1),
	isFavorite: z.boolean().optional(),
	imageUrl: z.string().url().nullable().optional()
});

export const recipeUpdateSchema = recipeCreateSchema.partial();
```

**Step 3: Export from index**

Add to `src/lib/server/validation/index.ts`:

```typescript
export * from './preferences';
```

**Step 4: Commit**

```bash
git add src/lib/server/validation/
git commit -m "feat: add preferences validation and recipe isFavorite/imageUrl fields"
```

---

## Task 3: Preferences DB Operations

**Files:**
- Create: `src/lib/server/preferences.ts`

**Step 1: Create preferences server module**

Create `src/lib/server/preferences.ts`:

```typescript
import { getDB } from '$lib/server/db';
import { userPreferences } from '$lib/server/schema';
import { preferencesUpdateSchema } from '$lib/server/validation';
import { eq } from 'drizzle-orm';
import type { ZodError } from 'zod';

type SuccessResult<T> = { success: true; data: T };
type ErrorResult = { success: false; error: ZodError | Error };
type Result<T> = SuccessResult<T> | ErrorResult;

export const getPreferences = async (userId: string) => {
	const db = getDB();
	const [prefs] = await db
		.select()
		.from(userPreferences)
		.where(eq(userPreferences.userId, userId));

	if (!prefs) {
		// Return defaults if no preferences set yet
		return {
			showFavoritesOnDashboard: true,
			favoriteTapAction: 'instant' as const
		};
	}

	return prefs;
};

export const updatePreferences = async (
	userId: string,
	payload: unknown
): Promise<Result<typeof userPreferences.$inferSelect>> => {
	const result = preferencesUpdateSchema.safeParse(payload);
	if (!result.success) {
		return { success: false, error: result.error };
	}

	try {
		const db = getDB();
		const [existing] = await db
			.select()
			.from(userPreferences)
			.where(eq(userPreferences.userId, userId));

		if (existing) {
			const [updated] = await db
				.update(userPreferences)
				.set({ ...result.data, updatedAt: new Date() })
				.where(eq(userPreferences.userId, userId))
				.returning();
			return { success: true, data: updated };
		} else {
			const [created] = await db
				.insert(userPreferences)
				.values({ userId, ...result.data })
				.returning();
			return { success: true, data: created };
		}
	} catch (error) {
		return { success: false, error: error as Error };
	}
};
```

**Step 2: Commit**

```bash
git add src/lib/server/preferences.ts
git commit -m "feat: add preferences DB operations"
```

---

## Task 4: Preferences API Endpoint

**Files:**
- Create: `src/routes/api/preferences/+server.ts`

**Step 1: Create preferences endpoint**

Create `src/routes/api/preferences/+server.ts`:

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPreferences, updatePreferences } from '$lib/server/preferences';
import { handleApiError, isZodError, requireAuth, validationError } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const userId = requireAuth(locals);
		const preferences = await getPreferences(userId);
		return json({ preferences });
	} catch (error) {
		return handleApiError(error);
	}
};

export const PATCH: RequestHandler = async ({ locals, request }) => {
	try {
		const userId = requireAuth(locals);
		const body = await request.json();
		const result = await updatePreferences(userId, body);
		if (!result.success) {
			if (isZodError(result.error)) {
				return validationError(result.error);
			}
			throw result.error;
		}
		return json({ preferences: result.data });
	} catch (error) {
		return handleApiError(error);
	}
};
```

**Step 2: Commit**

```bash
git add src/routes/api/preferences/
git commit -m "feat: add preferences API endpoint"
```

---

## Task 5: Image Upload — Server-side resize and save

**Files:**
- Create: `src/lib/server/uploads.ts`
- Create: `src/routes/api/uploads/+server.ts`

**Step 1: Install sharp for image processing**

Run: `bun add sharp`
Run: `bun add -d @types/sharp`

**Step 2: Create uploads utility**

Create `src/lib/server/uploads.ts`:

```typescript
import sharp from 'sharp';
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const UPLOAD_DIR = 'static/uploads';
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const IMAGE_SIZE = 400;

export const ensureUploadDir = async () => {
	if (!existsSync(UPLOAD_DIR)) {
		await mkdir(UPLOAD_DIR, { recursive: true });
	}
};

export const processAndSaveImage = async (file: File): Promise<string> => {
	if (file.size > MAX_FILE_SIZE) {
		throw new Error('File too large. Maximum size is 2MB.');
	}

	const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
	if (!allowedTypes.includes(file.type)) {
		throw new Error('Invalid file type. Allowed: JPEG, PNG, WebP.');
	}

	await ensureUploadDir();

	const buffer = Buffer.from(await file.arrayBuffer());
	const filename = `${randomUUID()}.webp`;
	const filepath = join(UPLOAD_DIR, filename);

	await sharp(buffer)
		.resize(IMAGE_SIZE, IMAGE_SIZE, { fit: 'cover' })
		.webp({ quality: 80 })
		.toFile(filepath);

	return `/uploads/${filename}`;
};
```

**Step 3: Create uploads API endpoint**

Create `src/routes/api/uploads/+server.ts`:

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { processAndSaveImage } from '$lib/server/uploads';
import { handleApiError, requireAuth } from '$lib/server/errors';

export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		requireAuth(locals);
		const formData = await request.formData();
		const file = formData.get('image') as File | null;

		if (!file) {
			return json({ error: 'No image provided' }, { status: 400 });
		}

		const url = await processAndSaveImage(file);
		return json({ url }, { status: 201 });
	} catch (error) {
		if (error instanceof Error && error.message.includes('File too large')) {
			return json({ error: error.message }, { status: 400 });
		}
		if (error instanceof Error && error.message.includes('Invalid file type')) {
			return json({ error: error.message }, { status: 400 });
		}
		return handleApiError(error);
	}
};
```

**Step 4: Add `static/uploads/` to `.gitignore`**

Append to `.gitignore`:

```
static/uploads/
```

**Step 5: Commit**

```bash
git add src/lib/server/uploads.ts src/routes/api/uploads/ .gitignore package.json bun.lockb
git commit -m "feat: add image upload endpoint with sharp resize"
```

---

## Task 6: Update Recipe Server Operations for New Fields

**Files:**
- Modify: `src/lib/server/recipes.ts`

**Step 1: Update `toRecipeInsert` to include new fields**

In `src/lib/server/recipes.ts`, update the `toRecipeInsert` function (line 13-17) and the `RecipeInput` type (line 7):

Change `RecipeInput` to:

```typescript
type RecipeInput = { name: string; totalServings: number; isFavorite?: boolean; imageUrl?: string | null };
```

Change `toRecipeInsert` to:

```typescript
export const toRecipeInsert = (userId: string, input: RecipeInput) => ({
	userId,
	name: input.name,
	totalServings: input.totalServings,
	isFavorite: input.isFavorite ?? false,
	imageUrl: input.imageUrl ?? null
});
```

**Step 2: Commit**

```bash
git add src/lib/server/recipes.ts
git commit -m "feat: support isFavorite and imageUrl in recipe operations"
```

---

## Task 7: Favorites API Endpoint — Combined foods + recipes ranked by log count

**Files:**
- Create: `src/lib/server/favorites.ts`
- Create: `src/routes/api/favorites/+server.ts`

**Step 1: Create favorites server module**

Create `src/lib/server/favorites.ts`:

```typescript
import { getDB } from '$lib/server/db';
import { foods, recipes, recipeIngredients, foodEntries } from '$lib/server/schema';
import { eq, and, sql, desc } from 'drizzle-orm';

export type FavoriteItem = {
	id: string;
	name: string;
	type: 'food' | 'recipe';
	calories: number;
	protein: number;
	carbs: number;
	fat: number;
	imageUrl: string | null;
	logCount: number;
};

export const listFavorites = async (userId: string): Promise<FavoriteItem[]> => {
	const db = getDB();

	// Favorite foods with log count
	const favFoods = await db
		.select({
			id: foods.id,
			name: foods.name,
			calories: foods.calories,
			protein: foods.protein,
			carbs: foods.carbs,
			fat: foods.fat,
			imageUrl: foods.imageUrl,
			logCount: sql<number>`count(${foodEntries.id})::int`
		})
		.from(foods)
		.leftJoin(foodEntries, and(eq(foodEntries.foodId, foods.id), eq(foodEntries.userId, userId)))
		.where(and(eq(foods.userId, userId), eq(foods.isFavorite, true)))
		.groupBy(foods.id);

	// Favorite recipes with log count
	// Calculate recipe calories by summing ingredient calories / totalServings
	const favRecipes = await db
		.select({
			id: recipes.id,
			name: recipes.name,
			totalServings: recipes.totalServings,
			imageUrl: recipes.imageUrl,
			logCount: sql<number>`count(${foodEntries.id})::int`
		})
		.from(recipes)
		.leftJoin(
			foodEntries,
			and(eq(foodEntries.recipeId, recipes.id), eq(foodEntries.userId, userId))
		)
		.where(and(eq(recipes.userId, userId), eq(recipes.isFavorite, true)))
		.groupBy(recipes.id);

	// For each favorite recipe, get its nutrition by summing ingredients
	const recipeItems: FavoriteItem[] = [];
	for (const recipe of favRecipes) {
		const ingredients = await db
			.select({
				quantity: recipeIngredients.quantity,
				calories: foods.calories,
				protein: foods.protein,
				carbs: foods.carbs,
				fat: foods.fat,
				servingSize: foods.servingSize
			})
			.from(recipeIngredients)
			.innerJoin(foods, eq(recipeIngredients.foodId, foods.id))
			.where(eq(recipeIngredients.recipeId, recipe.id));

		let totalCal = 0,
			totalPro = 0,
			totalCarb = 0,
			totalFat = 0;
		for (const ing of ingredients) {
			const factor = ing.quantity / ing.servingSize;
			totalCal += ing.calories * factor;
			totalPro += ing.protein * factor;
			totalCarb += ing.carbs * factor;
			totalFat += ing.fat * factor;
		}

		const servings = recipe.totalServings || 1;
		recipeItems.push({
			id: recipe.id,
			name: recipe.name,
			type: 'recipe',
			calories: Math.round(totalCal / servings),
			protein: Math.round(totalPro / servings),
			carbs: Math.round(totalCarb / servings),
			fat: Math.round(totalFat / servings),
			imageUrl: recipe.imageUrl,
			logCount: recipe.logCount
		});
	}

	const foodItems: FavoriteItem[] = favFoods.map((f) => ({
		id: f.id,
		name: f.name,
		type: 'food' as const,
		calories: f.calories,
		protein: f.protein,
		carbs: f.carbs,
		fat: f.fat,
		imageUrl: f.imageUrl,
		logCount: f.logCount
	}));

	// Combine and sort by log count descending
	return [...foodItems, ...recipeItems].sort((a, b) => b.logCount - a.logCount);
};
```

**Step 2: Create favorites API endpoint**

Create `src/routes/api/favorites/+server.ts`:

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listFavorites } from '$lib/server/favorites';
import { handleApiError, requireAuth } from '$lib/server/errors';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const userId = requireAuth(locals);
		const favorites = await listFavorites(userId);
		return json({ favorites });
	} catch (error) {
		return handleApiError(error);
	}
};
```

**Step 3: Commit**

```bash
git add src/lib/server/favorites.ts src/routes/api/favorites/
git commit -m "feat: add favorites API with combined foods+recipes ranked by log count"
```

---

## Task 8: i18n Messages — Add all new translation keys

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/de.json`

**Step 1: Add English messages**

Add these keys to `messages/en.json` (before the closing `}`):

```json
"nav_favorites": "Favorites",

"favorites_title": "Favorites",
"favorites_empty": "No favorites yet. Mark foods or recipes as favorites to see them here.",
"favorites_food": "Food",
"favorites_recipe": "Recipe",
"favorites_kcal": "{value} kcal",
"favorites_logged": "Logged to {meal}",
"favorites_undo": "Undo",
"favorites_see_all": "See all",
"favorites_top": "Favorites",
"favorites_servings": "Servings",
"favorites_meal": "Meal",
"favorites_add": "Add",
"favorites_cancel": "Cancel",

"settings_favorites": "Favorites",
"settings_show_favorites_dashboard": "Show favorites on dashboard",
"settings_favorite_tap_action": "Tap action",
"settings_tap_instant": "Instant log (1 serving)",
"settings_tap_choose": "Choose servings"
```

**Step 2: Add German messages**

Add matching keys to `messages/de.json` with German translations:

```json
"nav_favorites": "Favoriten",

"favorites_title": "Favoriten",
"favorites_empty": "Noch keine Favoriten. Markiere Lebensmittel oder Rezepte als Favoriten.",
"favorites_food": "Lebensmittel",
"favorites_recipe": "Rezept",
"favorites_kcal": "{value} kcal",
"favorites_logged": "Zu {meal} hinzugefügt",
"favorites_undo": "Rückgängig",
"favorites_see_all": "Alle anzeigen",
"favorites_top": "Favoriten",
"favorites_servings": "Portionen",
"favorites_meal": "Mahlzeit",
"favorites_add": "Hinzufügen",
"favorites_cancel": "Abbrechen",

"settings_favorites": "Favoriten",
"settings_show_favorites_dashboard": "Favoriten auf Dashboard anzeigen",
"settings_favorite_tap_action": "Tipp-Aktion",
"settings_tap_instant": "Sofort loggen (1 Portion)",
"settings_tap_choose": "Portionen wählen"
```

**Step 3: Regenerate Paraglide messages**

Run: `bun run dev` (start briefly, then stop with Ctrl+C — Vite plugin compiles messages)

**Step 4: Commit**

```bash
git add messages/
git commit -m "feat: add i18n messages for favorites feature (en + de)"
```

---

## Task 9: Navigation — Add Favorites link

**Files:**
- Modify: `src/lib/config/navigation.ts`

**Step 1: Add Heart icon import and nav item**

Update `src/lib/config/navigation.ts`:

```typescript
import Home from '@lucide/svelte/icons/home';
import Heart from '@lucide/svelte/icons/heart';
import Utensils from '@lucide/svelte/icons/utensils';
import CookingPot from '@lucide/svelte/icons/cooking-pot';
import Target from '@lucide/svelte/icons/target';
import Calendar from '@lucide/svelte/icons/calendar';
import Settings from '@lucide/svelte/icons/settings';
import * as m from '$lib/paraglide/messages';
import type { Component } from 'svelte';

export type NavItem = {
	title: () => string;
	href: string;
	icon: Component;
};

export function getNavItems(): NavItem[] {
	return [
		{ title: () => m.nav_dashboard(), href: '/app', icon: Home },
		{ title: () => m.nav_favorites(), href: '/app/favorites', icon: Heart },
		{ title: () => m.nav_foods(), href: '/app/foods', icon: Utensils },
		{ title: () => m.nav_recipes(), href: '/app/recipes', icon: CookingPot },
		{ title: () => m.nav_goals(), href: '/app/goals', icon: Target },
		{ title: () => m.nav_history(), href: '/app/history', icon: Calendar },
		{ title: () => m.nav_settings(), href: '/app/settings', icon: Settings }
	];
}
```

**Step 2: Commit**

```bash
git add src/lib/config/navigation.ts
git commit -m "feat: add Favorites to navigation"
```

---

## Task 10: FavoriteCard Component

**Files:**
- Create: `src/lib/components/favorites/FavoriteCard.svelte`

**Step 1: Create the reusable card component**

Create `src/lib/components/favorites/FavoriteCard.svelte`:

```svelte
<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import type { FavoriteItem } from '$lib/server/favorites';
	import UtensilsCrossed from '@lucide/svelte/icons/utensils-crossed';

	type Props = {
		item: FavoriteItem;
		size?: 'sm' | 'md';
		onclick?: () => void;
	};

	let { item, size = 'md', onclick }: Props = $props();

	const macroColors = {
		protein: 'bg-red-400',
		carbs: 'bg-orange-400',
		fat: 'bg-yellow-400'
	};

	const totalMacros = $derived(item.protein + item.carbs + item.fat || 1);
</script>

<button
	class="group relative flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md {size === 'sm' ? 'w-28' : 'w-36'}"
	{onclick}
>
	<!-- Image -->
	<div class="relative aspect-square w-full bg-muted {size === 'sm' ? 'h-28' : 'h-36'}">
		{#if item.imageUrl}
			<img
				src={item.imageUrl}
				alt={item.name}
				class="h-full w-full object-cover"
			/>
		{:else}
			<div class="flex h-full w-full items-center justify-center bg-muted">
				<UtensilsCrossed class="h-8 w-8 text-muted-foreground" />
			</div>
		{/if}
		<!-- Type badge -->
		<span class="absolute top-1 right-1 rounded-full bg-background/80 px-1.5 py-0.5 text-[10px] font-medium backdrop-blur-sm">
			{item.type === 'food' ? m.favorites_food() : m.favorites_recipe()}
		</span>
	</div>

	<!-- Info -->
	<div class="flex flex-col gap-1 p-2">
		<span class="truncate text-left text-xs font-medium {size === 'sm' ? 'text-[11px]' : ''}">
			{item.name}
		</span>
		<span class="text-left text-[11px] text-muted-foreground">
			{m.favorites_kcal({ value: item.calories })}
		</span>
		<!-- Macro bar -->
		<div class="flex h-1 w-full overflow-hidden rounded-full">
			<div class="{macroColors.protein} h-full" style="width: {(item.protein / totalMacros) * 100}%"></div>
			<div class="{macroColors.carbs} h-full" style="width: {(item.carbs / totalMacros) * 100}%"></div>
			<div class="{macroColors.fat} h-full" style="width: {(item.fat / totalMacros) * 100}%"></div>
		</div>
	</div>
</button>
```

**Step 2: Commit**

```bash
git add src/lib/components/favorites/
git commit -m "feat: add FavoriteCard component with image, macros, and type badge"
```

---

## Task 11: ServingsPicker Component

**Files:**
- Create: `src/lib/components/favorites/ServingsPicker.svelte`

**Step 1: Create servings picker bottom sheet**

Create `src/lib/components/favorites/ServingsPicker.svelte`:

```svelte
<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as m from '$lib/paraglide/messages';
	import type { FavoriteItem } from '$lib/server/favorites';

	type Props = {
		item: FavoriteItem | null;
		mealTypes: string[];
		onConfirm: (servings: number, mealType: string) => void;
		onCancel: () => void;
	};

	let { item, mealTypes, onConfirm, onCancel }: Props = $props();
	let servings = $state(1);
	let selectedMeal = $state('');

	$effect(() => {
		if (item) {
			servings = 1;
			selectedMeal = getCurrentMealType();
		}
	});

	function getCurrentMealType(): string {
		const hour = new Date().getHours();
		if (hour < 10) return 'Breakfast';
		if (hour < 15) return 'Lunch';
		if (hour < 21) return 'Dinner';
		return 'Snacks';
	}
</script>

{#if item}
	<div class="fixed inset-0 z-50 flex items-end justify-center bg-black/40" role="presentation" onclick={onCancel}>
		<div
			class="w-full max-w-md rounded-t-2xl bg-background p-6 shadow-xl"
			role="dialog"
			onclick={(e) => e.stopPropagation()}
		>
			<h3 class="mb-4 text-lg font-semibold">{item.name}</h3>

			<div class="space-y-4">
				<div>
					<label class="mb-1 text-sm font-medium" for="servings-input">{m.favorites_servings()}</label>
					<Input id="servings-input" type="number" step="0.1" min="0.1" bind:value={servings} />
				</div>

				<div>
					<label class="mb-1 text-sm font-medium" for="meal-select">{m.favorites_meal()}</label>
					<Select.Root type="single" bind:value={selectedMeal}>
						<Select.Trigger id="meal-select">{selectedMeal || m.edit_entry_select_meal()}</Select.Trigger>
						<Select.Content>
							{#each mealTypes as meal}
								<Select.Item value={meal}>{meal}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>

				<div class="flex gap-2">
					<Button variant="outline" class="flex-1" onclick={onCancel}>
						{m.favorites_cancel()}
					</Button>
					<Button class="flex-1" onclick={() => onConfirm(servings, selectedMeal)}>
						{m.favorites_add()}
					</Button>
				</div>
			</div>
		</div>
	</div>
{/if}
```

**Step 2: Commit**

```bash
git add src/lib/components/favorites/ServingsPicker.svelte
git commit -m "feat: add ServingsPicker bottom sheet component"
```

---

## Task 12: FavoritesWidget — Dashboard top-5 card

**Files:**
- Create: `src/lib/components/favorites/FavoritesWidget.svelte`

**Step 1: Create dashboard widget**

Create `src/lib/components/favorites/FavoritesWidget.svelte`:

```svelte
<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import * as m from '$lib/paraglide/messages';
	import FavoriteCard from './FavoriteCard.svelte';
	import type { FavoriteItem } from '$lib/server/favorites';

	type Props = {
		favorites: FavoriteItem[];
		onTap: (item: FavoriteItem) => void;
	};

	let { favorites, onTap }: Props = $props();

	const top5 = $derived(favorites.slice(0, 5));
</script>

{#if top5.length > 0}
	<Card.Root>
		<Card.Header class="flex flex-row items-center justify-between pb-2">
			<Card.Title class="text-base">{m.favorites_top()}</Card.Title>
			<a href="/app/favorites" class="text-sm text-muted-foreground hover:underline">
				{m.favorites_see_all()}
			</a>
		</Card.Header>
		<Card.Content>
			<div class="flex gap-3 overflow-x-auto pb-2">
				{#each top5 as item (item.id)}
					<FavoriteCard {item} size="sm" onclick={() => onTap(item)} />
				{/each}
			</div>
		</Card.Content>
	</Card.Root>
{/if}
```

**Step 2: Commit**

```bash
git add src/lib/components/favorites/FavoritesWidget.svelte
git commit -m "feat: add FavoritesWidget dashboard component"
```

---

## Task 13: Favorites Page

**Files:**
- Create: `src/routes/app/favorites/+page.svelte`

**Step 1: Create the full favorites grid page**

Create `src/routes/app/favorites/+page.svelte`:

```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import * as m from '$lib/paraglide/messages';
	import FavoriteCard from '$lib/components/favorites/FavoriteCard.svelte';
	import ServingsPicker from '$lib/components/favorites/ServingsPicker.svelte';
	import type { FavoriteItem } from '$lib/server/favorites';
	import { toast } from 'svelte-sonner';

	let favorites: FavoriteItem[] = $state([]);
	let tapAction: string = $state('instant');
	let pickerItem: FavoriteItem | null = $state(null);
	const mealTypes = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

	const loadFavorites = async () => {
		const res = await fetch('/api/favorites');
		const data = await res.json();
		favorites = data.favorites;
	};

	const loadPreferences = async () => {
		const res = await fetch('/api/preferences');
		const data = await res.json();
		tapAction = data.preferences.favoriteTapAction ?? 'instant';
	};

	function getCurrentMealType(): string {
		const hour = new Date().getHours();
		if (hour < 10) return 'Breakfast';
		if (hour < 15) return 'Lunch';
		if (hour < 21) return 'Dinner';
		return 'Snacks';
	}

	const logEntry = async (item: FavoriteItem, servings: number, mealType: string) => {
		const today = new Date().toISOString().split('T')[0];
		const body: Record<string, unknown> = { mealType, servings, date: today };
		if (item.type === 'food') body.foodId = item.id;
		else body.recipeId = item.id;

		const res = await fetch('/api/entries', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});

		if (res.ok) {
			const { entry } = await res.json();
			toast.success(m.favorites_logged({ meal: mealType }), {
				action: {
					label: m.favorites_undo(),
					onClick: async () => {
						await fetch(`/api/entries/${entry.id}`, { method: 'DELETE' });
					}
				}
			});
		}
	};

	const handleTap = (item: FavoriteItem) => {
		if (tapAction === 'instant') {
			logEntry(item, 1, getCurrentMealType());
		} else {
			pickerItem = item;
		}
	};

	const handlePickerConfirm = (servings: number, mealType: string) => {
		if (pickerItem) {
			logEntry(pickerItem, servings, mealType);
			pickerItem = null;
		}
	};

	onMount(() => {
		loadFavorites();
		loadPreferences();
	});
</script>

<div class="mx-auto max-w-2xl space-y-4">
	<h1 class="text-2xl font-bold">{m.favorites_title()}</h1>

	{#if favorites.length === 0}
		<p class="text-muted-foreground">{m.favorites_empty()}</p>
	{:else}
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
			{#each favorites as item (item.id)}
				<FavoriteCard {item} onclick={() => handleTap(item)} />
			{/each}
		</div>
	{/if}
</div>

<ServingsPicker
	item={pickerItem}
	{mealTypes}
	onConfirm={handlePickerConfirm}
	onCancel={() => (pickerItem = null)}
/>
```

**Step 2: Commit**

```bash
git add src/routes/app/favorites/
git commit -m "feat: add favorites page with grid layout and tap-to-log"
```

---

## Task 14: Integrate FavoritesWidget into Dashboard

**Files:**
- Modify: `src/routes/app/+page.svelte`

**Step 1: Add favorites widget to dashboard**

In `src/routes/app/+page.svelte`, add the following changes:

1. Add imports (near top of script, after existing imports):

```typescript
import FavoritesWidget from '$lib/components/favorites/FavoritesWidget.svelte';
import ServingsPicker from '$lib/components/favorites/ServingsPicker.svelte';
import type { FavoriteItem } from '$lib/server/favorites';
import { toast } from 'svelte-sonner';
```

2. Add state variables (after existing state declarations around line 31):

```typescript
let favorites: FavoriteItem[] = $state([]);
let showFavoritesWidget = $state(true);
let favoriteTapAction = $state('instant');
let pickerItem: FavoriteItem | null = $state(null);
```

3. Add load functions (after existing load functions around line 44):

```typescript
const loadFavorites = async () => {
	const res = await fetch('/api/favorites');
	const data = await res.json();
	favorites = data.favorites;
};

const loadPreferences = async () => {
	const res = await fetch('/api/preferences');
	const data = await res.json();
	showFavoritesWidget = data.preferences.showFavoritesOnDashboard ?? true;
	favoriteTapAction = data.preferences.favoriteTapAction ?? 'instant';
};
```

4. Add these to the `onMount` `Promise.all` (the existing one around line 35-44):

Add `loadFavorites()` and `loadPreferences()` to the existing Promise.all.

5. Add tap handler functions:

```typescript
function getCurrentMealType(): string {
	const hour = new Date().getHours();
	if (hour < 10) return 'Breakfast';
	if (hour < 15) return 'Lunch';
	if (hour < 21) return 'Dinner';
	return 'Snacks';
}

const logFavorite = async (item: FavoriteItem, servings: number, mealType: string) => {
	const body: Record<string, unknown> = { mealType, servings, date: today };
	if (item.type === 'food') body.foodId = item.id;
	else body.recipeId = item.id;

	const res = await fetch('/api/entries', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});

	if (res.ok) {
		const { entry } = await res.json();
		await loadEntries();
		toast.success(m.favorites_logged({ meal: mealType }), {
			action: {
				label: m.favorites_undo(),
				onClick: async () => {
					await fetch(`/api/entries/${entry.id}`, { method: 'DELETE' });
					await loadEntries();
				}
			}
		});
	}
};

const handleFavoriteTap = (item: FavoriteItem) => {
	if (favoriteTapAction === 'instant') {
		logFavorite(item, 1, getCurrentMealType());
	} else {
		pickerItem = item;
	}
};
```

6. In the template, add the widget before the meal sections (after the calorie summary / weekly chart, before the `{#each}` that renders meal sections):

```svelte
{#if showFavoritesWidget}
	<FavoritesWidget {favorites} onTap={handleFavoriteTap} />
{/if}
```

7. Add ServingsPicker at the bottom of the template:

```svelte
<ServingsPicker
	item={pickerItem}
	mealTypes={['Breakfast', 'Lunch', 'Dinner', 'Snacks']}
	onConfirm={(servings, meal) => {
		if (pickerItem) logFavorite(pickerItem, servings, meal);
		pickerItem = null;
	}}
	onCancel={() => (pickerItem = null)}
/>
```

**Step 2: Commit**

```bash
git add src/routes/app/+page.svelte
git commit -m "feat: add favorites widget to dashboard with tap-to-log"
```

---

## Task 15: Update RecipeForm — Add image upload and isFavorite toggle

**Files:**
- Modify: `src/lib/components/recipes/RecipeForm.svelte`

**Step 1: Add image upload and favorite toggle to recipe form**

Add to the RecipeForm state:

```typescript
let imageFile: File | null = $state(null);
let imagePreview: string | null = $state(null);
let isFavorite = $state(false);
```

Add image upload handler:

```typescript
const handleImageSelect = (e: Event) => {
	const input = e.target as HTMLInputElement;
	const file = input.files?.[0];
	if (file) {
		imageFile = file;
		imagePreview = URL.createObjectURL(file);
	}
};

const uploadImage = async (): Promise<string | null> => {
	if (!imageFile) return null;
	const formData = new FormData();
	formData.append('image', imageFile);
	const res = await fetch('/api/uploads', { method: 'POST', body: formData });
	if (res.ok) {
		const data = await res.json();
		return data.url;
	}
	return null;
};
```

Modify `handleSubmit` to upload image first, then include `isFavorite` and `imageUrl` in the payload.

Add to the form template (before the ingredients section):

```svelte
<!-- Image upload -->
<div>
	<label class="mb-1 text-sm font-medium">Image</label>
	{#if imagePreview}
		<img src={imagePreview} alt="Preview" class="mb-2 h-32 w-32 rounded-lg object-cover" />
	{/if}
	<input
		type="file"
		accept="image/*"
		capture="environment"
		onchange={handleImageSelect}
		class="block w-full text-sm"
	/>
</div>

<!-- Favorite toggle -->
<label class="flex items-center gap-2">
	<input type="checkbox" bind:checked={isFavorite} />
	<span class="text-sm">{m.food_form_favorite()}</span>
</label>
```

**Step 2: Commit**

```bash
git add src/lib/components/recipes/RecipeForm.svelte
git commit -m "feat: add image upload and favorite toggle to recipe form"
```

---

## Task 16: Update AddFoodModal — Visual favorites tab with foods + recipes

**Files:**
- Modify: `src/lib/components/entries/AddFoodModal.svelte`

**Step 1: Upgrade the Favorites tab**

In `AddFoodModal.svelte`, the existing Favorites tab (around lines 101-113) shows a text-only list of favorite foods. Replace it to:

1. Import `FavoriteCard` and the `FavoriteItem` type
2. Load favorites from `/api/favorites` instead of filtering client-side
3. Render as a grid of `FavoriteCard` components instead of text list
4. When a card is tapped, set the selected food/recipe and servings as usual

The favorites tab content should become:

```svelte
<div class="grid grid-cols-2 gap-2">
	{#each favoritesData as item (item.id)}
		<FavoriteCard
			{item}
			size="sm"
			onclick={() => {
				if (item.type === 'food') {
					selectedFood = foods.find((f) => f.id === item.id) ?? null;
					selectedRecipe = null;
				} else {
					selectedRecipe = recipes.find((r) => r.id === item.id) ?? null;
					selectedFood = null;
				}
			}}
		/>
	{:else}
		<p class="col-span-2 text-center text-sm text-muted-foreground">{m.add_food_no_favorites()}</p>
	{/each}
</div>
```

Load favorites data when the tab is activated (similar to how "Recent" tab lazy-loads).

**Step 2: Commit**

```bash
git add src/lib/components/entries/AddFoodModal.svelte
git commit -m "feat: upgrade AddFoodModal favorites tab with visual cards and recipe support"
```

---

## Task 17: Settings Page — Add favorites preferences

**Files:**
- Modify: `src/routes/app/settings/+page.svelte`

**Step 1: Add favorites settings card**

Add a new Card section to `src/routes/app/settings/+page.svelte` (after the language card):

```svelte
<Card.Root>
	<Card.Header>
		<Card.Title>{m.settings_favorites()}</Card.Title>
	</Card.Header>
	<Card.Content class="space-y-4">
		<label class="flex items-center justify-between">
			<span class="text-sm">{m.settings_show_favorites_dashboard()}</span>
			<input
				type="checkbox"
				bind:checked={showFavorites}
				onchange={() => savePreferences()}
			/>
		</label>

		<div>
			<span class="mb-2 block text-sm font-medium">{m.settings_favorite_tap_action()}</span>
			<div class="space-y-2">
				<label class="flex items-center gap-2">
					<input type="radio" name="tapAction" value="instant" bind:group={tapAction} onchange={() => savePreferences()} />
					<span class="text-sm">{m.settings_tap_instant()}</span>
				</label>
				<label class="flex items-center gap-2">
					<input type="radio" name="tapAction" value="choose_servings" bind:group={tapAction} onchange={() => savePreferences()} />
					<span class="text-sm">{m.settings_tap_choose()}</span>
				</label>
			</div>
		</div>
	</Card.Content>
</Card.Root>
```

Add to the script section:

```typescript
let showFavorites = $state(true);
let tapAction = $state('instant');

const loadPreferences = async () => {
	const res = await fetch('/api/preferences');
	const data = await res.json();
	showFavorites = data.preferences.showFavoritesOnDashboard ?? true;
	tapAction = data.preferences.favoriteTapAction ?? 'instant';
};

const savePreferences = async () => {
	await fetch('/api/preferences', {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			showFavoritesOnDashboard: showFavorites,
			favoriteTapAction: tapAction
		})
	});
};
```

Add `loadPreferences()` to the existing `onMount`.

**Step 2: Commit**

```bash
git add src/routes/app/settings/+page.svelte
git commit -m "feat: add favorites settings (dashboard toggle + tap action)"
```

---

## Task 18: End-to-End Verification

**Step 1: Run type checking**

Run: `bun run check`
Expected: No type errors

**Step 2: Run existing tests**

Run: `bun test`
Expected: All existing tests pass (193 tests, known 4 mock-persistence warnings are OK)

**Step 3: Start dev server and verify manually**

Run: `bun run dev`

Verify:
- [ ] Favorites nav item appears in sidebar
- [ ] `/app/favorites` page loads with empty state
- [ ] Mark a food as favorite → appears on favorites page with image card
- [ ] Mark a recipe as favorite → appears on favorites page
- [ ] Dashboard shows top-5 widget (if favorites exist)
- [ ] Tap a card → instant log works (toast with undo)
- [ ] Settings → toggle "show on dashboard" → widget hides/shows
- [ ] Settings → change to "choose servings" → tap shows picker
- [ ] Recipe form → upload image → image shows on card
- [ ] AddFoodModal → Favorites tab shows visual cards

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete favorites tab with dashboard widget, image upload, and settings"
```
