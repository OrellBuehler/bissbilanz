# Bottom Sheet for Foods & Recipes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move all food and recipe create/edit flows into ResponsiveModal bottom sheets on the list pages, matching the supplements pattern.

**Architecture:** Consolidate edit logic from dedicated `/foods/[id]` and `/recipes/[id]` pages into the list pages. FoodForm gets an edit mode with image upload. Barcode flow stays on `/foods` with URL param auto-opening the modal.

**Tech Stack:** SvelteKit 2.x, Svelte 5, ResponsiveModal (Dialog on desktop, Drawer on mobile)

**Design doc:** `docs/plans/2026-02-25-bottom-sheet-foods-recipes-design.md`

---

### Task 1: Add edit mode to FoodForm

FoodForm already accepts `initial` for pre-filling. Add support for image upload and favorite toggle when editing.

**Files:**

- Modify: `src/lib/components/foods/FoodForm.svelte`

**Step 1: Add editing props to FoodForm**

Add these props to the `Props` type and destructuring:

```typescript
type Props = {
	initial?: Partial<FoodFormData>;
	onSave: (payload: FoodFormData) => Promise<void>;
	onBarcodeScan?: (barcode: string) => void;
	imageUrl?: string | null;
	onImageUpload?: (file: File) => Promise<void>;
};
```

Add to destructuring:

```typescript
let { initial = {}, onSave, onBarcodeScan, imageUrl, onImageUpload }: Props = $props();
```

**Step 2: Add image upload section at the top of the form template**

Before the first `<div class="grid gap-3">`, add an image section that only shows when `onImageUpload` is provided:

```svelte
{#if onImageUpload}
	<div class="space-y-2">
		<div class="aspect-video w-full overflow-hidden rounded-xl border">
			{#if imageUrl}
				<img src={imageUrl} alt={form.name} class="h-full w-full object-cover" />
			{:else}
				<div class="flex h-full w-full items-center justify-center bg-muted">
					<span class="text-4xl font-bold text-muted-foreground">{form.name.charAt(0).toUpperCase()}</span>
				</div>
			{/if}
		</div>
		<Label for="food-image-upload">{m.image_upload_label()}</Label>
		<input
			id="food-image-upload"
			type="file"
			accept="image/*"
			onchange={async (e) => {
				const file = (e.target as HTMLInputElement).files?.[0];
				if (file) await onImageUpload(file);
			}}
			class="mt-1 block w-full text-sm file:mr-4 file:rounded file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
		/>
	</div>
{/if}
```

Wrap the existing form content inside the `<div class="grid gap-3">` so the image section is outside/above it.

**Step 3: Verify**

Run: `bun run check`
Expected: 0 errors

**Step 4: Commit**

```bash
git add src/lib/components/foods/FoodForm.svelte
git commit -m "feat: add image upload support to FoodForm"
```

---

### Task 2: Consolidate foods page — edit in bottom sheet

Move the edit flow from `/foods/[id]` into the foods list page as a ResponsiveModal.

**Files:**

- Modify: `src/routes/(app)/foods/+page.svelte` (major rewrite)
- Delete: `src/routes/(app)/foods/[id]/+page.svelte`
- Delete: `src/routes/(app)/foods/[id]/` (directory)

**Step 1: Rewrite the foods page**

The new page combines:

- List (existing)
- Create modal (existing)
- Edit modal (new — loads food by ID, opens ResponsiveModal with FoodForm pre-filled)
- Barcode create (from `/foods/new` — read URL param `?barcode=`, auto-open modal, fetch OFF data)

Here is the complete new `src/routes/(app)/foods/+page.svelte`:

```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import FoodForm from '$lib/components/foods/FoodForm.svelte';
	import FoodList from '$lib/components/foods/FoodList.svelte';
	import FoodQualityPanel from '$lib/components/quality/FoodQualityPanel.svelte';
	import { filterFoods } from '$lib/components/foods/foodFilters';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { ResponsiveModal } from '$lib/components/ui/responsive-modal/index.js';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import { apiFetch } from '$lib/utils/api';
	import { toast } from 'svelte-sonner';
	import { browser } from '$app/environment';
	import * as m from '$lib/paraglide/messages';

	let foods: Array<any> = $state([]);
	let query = $state('');
	let showForm = $state(false);
	let editingFood: any | null = $state(null);
	let editImageUrl: string | null = $state(null);

	// Barcode / OpenFoodFacts state
	let offData = $state<any>(null);
	let offLoading = $state(false);
	let offNotFound = $state(false);
	let activeBarcode = $state('');

	const loadFoods = async () => {
		const res = await fetch('/api/foods');
		const data = await res.json();
		foods = data.foods;
	};

	const createFood = async (payload: any) => {
		const body = offData
			? {
					...payload,
					novaGroup: offData.novaGroup,
					additives: offData.additives,
					ingredientsText: offData.ingredientsText,
					imageUrl: offData.imageUrl
				}
			: payload;
		await apiFetch('/api/foods', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		closeForm();
		await loadFoods();
	};

	const updateFood = async (payload: any) => {
		if (!editingFood) return;
		const res = await apiFetch(`/api/foods/${editingFood.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ ...payload, imageUrl: editImageUrl })
		});
		if (res.ok) {
			toast.success(m.detail_saved());
		} else {
			toast.error(m.detail_save_failed());
		}
		closeForm();
		await loadFoods();
	};

	const deleteFood = async (id: string) => {
		await apiFetch(`/api/foods/${id}`, { method: 'DELETE' });
		await loadFoods();
	};

	const enrichFood = async (id: string, barcode: string) => {
		const res = await fetch(`/api/openfoodfacts/${barcode}`);
		if (!res.ok) return;
		const { product } = await res.json();
		await apiFetch(`/api/foods/${id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				nutriScore: product.nutriScore,
				novaGroup: product.novaGroup,
				additives: product.additives,
				ingredientsText: product.ingredientsText,
				imageUrl: product.imageUrl
			})
		});
		await loadFoods();
	};

	const openEdit = async (id: string) => {
		const res = await fetch(`/api/foods/${id}`);
		if (!res.ok) return;
		const data = await res.json();
		editingFood = data.food;
		editImageUrl = data.food.imageUrl;
		offData = null;
		activeBarcode = '';
		showForm = true;
	};

	const handleImageUpload = async (file: File) => {
		if (!editingFood) return;
		const formData = new FormData();
		formData.append('image', file);
		try {
			const uploadRes = await fetch('/api/images/upload', {
				method: 'POST',
				body: formData
			});
			if (!uploadRes.ok) {
				toast.error(m.image_upload_failed());
				return;
			}
			const { imageUrl: newUrl } = await uploadRes.json();
			editImageUrl = newUrl;
			await apiFetch(`/api/foods/${editingFood.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ imageUrl: newUrl })
			});
		} catch {
			toast.error(m.image_upload_failed());
		}
	};

	const closeForm = () => {
		showForm = false;
		editingFood = null;
		editImageUrl = null;
		offData = null;
		offNotFound = false;
		activeBarcode = '';
	};

	const handleBarcodeScan = (barcode: string) => {
		activeBarcode = barcode;
		fetchFromOFF(barcode);
	};

	async function fetchFromOFF(code: string) {
		if (!code) return;
		offLoading = true;
		offNotFound = false;
		try {
			const res = await fetch(`/api/openfoodfacts/${code}`);
			if (res.ok) {
				offData = (await res.json()).product;
			} else {
				offNotFound = true;
			}
		} catch {
			offNotFound = true;
		} finally {
			offLoading = false;
		}
	}

	// Handle ?barcode= URL param — auto-open create modal with barcode
	$effect(() => {
		if (browser) {
			const urlBarcode = $page.url.searchParams.get('barcode');
			if (urlBarcode && !showForm) {
				activeBarcode = urlBarcode;
				fetchFromOFF(urlBarcode);
				showForm = true;
			}
		}
	});

	onMount(() => {
		loadFoods();
	});

	const filtered = $derived(filterFoods(foods, query));

	const formInitial = $derived(
		editingFood
			? {
					name: editingFood.name,
					brand: editingFood.brand ?? '',
					servingSize: editingFood.servingSize,
					servingUnit: editingFood.servingUnit,
					calories: editingFood.calories,
					protein: editingFood.protein,
					carbs: editingFood.carbs,
					fat: editingFood.fat,
					fiber: editingFood.fiber,
					barcode: editingFood.barcode ?? '',
					isFavorite: editingFood.isFavorite,
					nutriScore: editingFood.nutriScore,
					sodium: editingFood.sodium,
					sugar: editingFood.sugar,
					saturatedFat: editingFood.saturatedFat,
					cholesterol: editingFood.cholesterol
				}
			: offData
				? {
						name: offData.name,
						brand: offData.brand,
						servingSize: offData.servingSize,
						servingUnit: offData.servingUnit,
						calories: offData.calories,
						protein: offData.protein,
						carbs: offData.carbs,
						fat: offData.fat,
						fiber: offData.fiber,
						sodium: offData.sodium,
						sugar: offData.sugar,
						saturatedFat: offData.saturatedFat,
						cholesterol: offData.cholesterol,
						nutriScore: offData.nutriScore,
						barcode: activeBarcode,
						isFavorite: false
					}
				: { barcode: activeBarcode }
	);
</script>

<div class="mx-auto max-w-2xl space-y-4 pb-4">
	<div class="relative">
		<Search
			class="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
		/>
		<Input
			class="w-full min-w-0 pl-9"
			placeholder={m.foods_search_placeholder()}
			bind:value={query}
		/>
	</div>

	{#if query && filtered.length === 0}
		<p class="py-8 text-center text-sm text-muted-foreground">{m.foods_no_results()}</p>
	{:else}
		<FoodList foods={filtered} onEdit={openEdit} onDelete={deleteFood} onEnrich={enrichFood} />
	{/if}
</div>

<Button
	size="icon"
	class="fixed bottom-6 right-6 z-50 size-14 rounded-full shadow-lg"
	aria-label={m.foods_new()}
	onclick={() => {
		editingFood = null;
		editImageUrl = null;
		offData = null;
		activeBarcode = '';
		showForm = true;
	}}
>
	<Plus class="size-6" />
</Button>

<ResponsiveModal
	bind:open={showForm}
	title={editingFood ? m.food_form_name() : m.foods_new()}
	description={editingFood ? editingFood.name : m.foods_new_description()}
>
	{#if offLoading}
		<p class="text-sm text-muted-foreground">{m.quality_off_loading()}</p>
	{:else}
		{#if offNotFound && activeBarcode}
			<p class="mb-3 text-sm text-amber-600">{m.quality_off_not_found()}</p>
		{:else if offData && !editingFood}
			<p class="mb-3 text-sm text-green-600">{m.quality_off_prefilled()}</p>
			<FoodQualityPanel
				nutriScore={offData.nutriScore}
				novaGroup={offData.novaGroup}
				additives={offData.additives}
				ingredientsText={offData.ingredientsText}
			/>
		{/if}
		{#key editingFood?.id ?? offData ?? activeBarcode}
			<FoodForm
				initial={formInitial}
				onSave={editingFood ? updateFood : createFood}
				onBarcodeScan={!editingFood ? handleBarcodeScan : undefined}
				imageUrl={editingFood ? editImageUrl : undefined}
				onImageUpload={editingFood ? handleImageUpload : undefined}
			/>
		{/key}
	{/if}
</ResponsiveModal>
```

**Step 2: Delete the old food detail page**

Delete `src/routes/(app)/foods/[id]/+page.svelte` and the `[id]` directory.

**Step 3: Delete the old foods/new page**

Delete `src/routes/(app)/foods/new/+page.svelte` and the `new` directory. Also delete any `+page.ts` or `+page.server.ts` in those directories if they exist.

**Step 4: Verify**

Run: `bun run check`
Expected: 0 errors. If there are broken imports or references to the deleted pages, fix them.

Check for any links to `/foods/[id]` or `/foods/new` in other files:

```bash
grep -r "foods/new\|/foods/\[" src/ --include="*.svelte" --include="*.ts" -l
```

Fix any references to use the new modal pattern.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: consolidate food edit/create into bottom sheet"
```

---

### Task 3: Consolidate recipes page — edit in bottom sheet

Move the edit flow from `/recipes/[id]` into the recipes list page.

**Files:**

- Modify: `src/routes/(app)/recipes/+page.svelte` (major rewrite)
- Delete: `src/routes/(app)/recipes/[id]/+page.svelte`
- Delete: `src/routes/(app)/recipes/[id]/` (directory)

**Step 1: Create a RecipeEditForm component**

The recipe edit form is different from RecipeForm (create) — it edits name, servings, image, favorite, and shows read-only ingredients. Create `src/lib/components/recipes/RecipeEditForm.svelte`:

```svelte
<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import Check from '@lucide/svelte/icons/check';
	import * as m from '$lib/paraglide/messages';

	type Ingredient = {
		id: string;
		foodId: string;
		quantity: number;
		servingUnit: string;
		sortOrder: number;
	};

	type Props = {
		recipe: {
			id: string;
			name: string;
			totalServings: number;
			isFavorite: boolean;
			imageUrl: string | null;
			ingredients: Ingredient[];
		};
		onSave: (payload: {
			name: string;
			totalServings: number;
			isFavorite: boolean;
			imageUrl: string | null;
		}) => Promise<void>;
		imageUrl?: string | null;
		onImageUpload?: (file: File) => Promise<void>;
	};

	let { recipe, onSave, imageUrl, onImageUpload }: Props = $props();

	let name = $state(recipe.name);
	let totalServings = $state(recipe.totalServings);
	let isFavorite = $state(recipe.isFavorite);
	let saving = $state(false);

	async function handleSave() {
		saving = true;
		try {
			await onSave({ name, totalServings, isFavorite, imageUrl: imageUrl ?? null });
		} finally {
			saving = false;
		}
	}
</script>

<div class="space-y-4">
	{#if onImageUpload}
		<div class="space-y-2">
			<div class="aspect-video w-full overflow-hidden rounded-xl border">
				{#if imageUrl}
					<img src={imageUrl} alt={name} class="h-full w-full object-cover" />
				{:else}
					<div class="flex h-full w-full items-center justify-center bg-muted">
						<span class="text-4xl font-bold text-muted-foreground"
							>{name.charAt(0).toUpperCase()}</span
						>
					</div>
				{/if}
			</div>
			<Label for="recipe-image-upload">{m.image_upload_label()}</Label>
			<input
				id="recipe-image-upload"
				type="file"
				accept="image/*"
				onchange={async (e) => {
					const file = (e.target as HTMLInputElement).files?.[0];
					if (file && onImageUpload) await onImageUpload(file);
				}}
				class="mt-1 block w-full text-sm file:mr-4 file:rounded file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
			/>
		</div>
	{/if}

	<div class="flex items-center gap-3">
		<Switch bind:checked={isFavorite} />
		<Label>{m.mark_as_favorite()}</Label>
	</div>

	<div class="grid gap-4">
		<div class="grid gap-2">
			<Label for="edit-recipe-name">{m.recipe_form_name()}</Label>
			<Input id="edit-recipe-name" bind:value={name} />
		</div>
		<div class="grid gap-2">
			<Label for="edit-recipe-servings">{m.recipe_form_servings()}</Label>
			<Input id="edit-recipe-servings" type="number" bind:value={totalServings} min="1" step="1" />
		</div>
	</div>

	{#if recipe.ingredients.length > 0}
		<Card.Root>
			<Card.Header class="pb-2">
				<Card.Title class="text-base">{m.detail_ingredients()}</Card.Title>
			</Card.Header>
			<Card.Content>
				<ul class="space-y-1 text-sm">
					{#each recipe.ingredients as ingredient}
						<li class="text-muted-foreground">
							{ingredient.quantity}
							{ingredient.servingUnit}
						</li>
					{/each}
				</ul>
			</Card.Content>
		</Card.Root>
	{/if}

	<Button class="w-full" onclick={handleSave} disabled={saving}>
		<Check class="size-4" />
		{saving ? m.detail_saving() : m.save_changes()}
	</Button>
</div>
```

**Step 2: Rewrite the recipes page**

Here is the complete new `src/routes/(app)/recipes/+page.svelte`:

```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import RecipeForm from '$lib/components/recipes/RecipeForm.svelte';
	import RecipeEditForm from '$lib/components/recipes/RecipeEditForm.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { ResponsiveModal } from '$lib/components/ui/responsive-modal/index.js';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { apiFetch } from '$lib/utils/api';
	import { toast } from 'svelte-sonner';
	import * as m from '$lib/paraglide/messages';

	type Recipe = {
		id: string;
		name: string;
		totalServings: number;
		isFavorite: boolean;
		imageUrl: string | null;
		calories: number;
		protein: number;
		carbs: number;
		fat: number;
	};

	let foods: Array<{ id: string; name: string; servingUnit?: string }> = $state([]);
	let recipes: Recipe[] = $state([]);
	let showForm = $state(false);
	let editingRecipe: any | null = $state(null);
	let editImageUrl: string | null = $state(null);

	const loadFoods = async () => {
		const res = await fetch('/api/foods');
		foods = (await res.json()).foods;
	};

	const loadRecipes = async () => {
		const res = await fetch('/api/recipes');
		recipes = (await res.json()).recipes;
	};

	const createRecipe = async (payload: any) => {
		await apiFetch('/api/recipes', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		});
		closeForm();
		await loadRecipes();
	};

	const updateRecipe = async (payload: { name: string; totalServings: number; isFavorite: boolean; imageUrl: string | null }) => {
		if (!editingRecipe) return;
		const res = await apiFetch(`/api/recipes/${editingRecipe.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		});
		if (res.ok) {
			toast.success(m.detail_saved());
		} else {
			toast.error(m.detail_save_failed());
		}
		closeForm();
		await loadRecipes();
	};

	const deleteRecipe = async (e: Event, id: string) => {
		e.stopPropagation();
		await apiFetch(`/api/recipes/${id}`, { method: 'DELETE' });
		await loadRecipes();
	};

	const openEdit = async (id: string) => {
		const res = await fetch(`/api/recipes/${id}`);
		if (!res.ok) return;
		const data = await res.json();
		editingRecipe = data.recipe;
		editImageUrl = data.recipe.imageUrl;
		showForm = true;
	};

	const handleImageUpload = async (file: File) => {
		if (!editingRecipe) return;
		const formData = new FormData();
		formData.append('image', file);
		try {
			const uploadRes = await fetch('/api/images/upload', {
				method: 'POST',
				body: formData
			});
			if (!uploadRes.ok) {
				toast.error(m.image_upload_failed());
				return;
			}
			const { imageUrl: newUrl } = await uploadRes.json();
			editImageUrl = newUrl;
			await apiFetch(`/api/recipes/${editingRecipe.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ imageUrl: newUrl })
			});
		} catch {
			toast.error(m.image_upload_failed());
		}
	};

	const closeForm = () => {
		showForm = false;
		editingRecipe = null;
		editImageUrl = null;
	};

	onMount(() => {
		loadFoods();
		loadRecipes();
	});

	const fmt = (n: number) => Math.round(n);
</script>

<div class="mx-auto max-w-2xl space-y-4 pb-4">
	{#if recipes.length === 0}
		<p class="py-8 text-center text-sm text-muted-foreground">{m.recipes_no_recipes()}</p>
	{:else}
		<div class="space-y-2">
			{#each recipes as recipe}
				<Card.Root
					class="cursor-pointer transition-colors hover:bg-accent/50"
					onclick={() => openEdit(recipe.id)}
				>
					<Card.Content class="flex items-start justify-between gap-2 p-4">
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
								<span class="truncate font-medium">{recipe.name}</span>
								<span class="shrink-0 text-xs text-muted-foreground">
									{m.recipes_servings({ count: recipe.totalServings })}
								</span>
							</div>
							<div class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
								<span class="font-medium text-blue-500">{fmt(recipe.calories)} kcal</span>
								<span class="text-red-500">{fmt(recipe.protein)}g P</span>
								<span class="text-orange-500">{fmt(recipe.carbs)}g C</span>
								<span class="text-yellow-600">{fmt(recipe.fat)}g F</span>
							</div>
						</div>
						<Button
							variant="ghost"
							size="icon"
							class="mt-0.5 shrink-0 text-muted-foreground hover:text-destructive"
							onclick={(e) => deleteRecipe(e, recipe.id)}
						>
							<Trash2 class="size-4" />
						</Button>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{/if}
</div>

<Button
	size="icon"
	class="fixed bottom-6 right-6 z-50 size-14 rounded-full shadow-lg"
	aria-label={m.recipes_new()}
	onclick={() => {
		editingRecipe = null;
		editImageUrl = null;
		showForm = true;
	}}
>
	<Plus class="size-6" />
</Button>

<ResponsiveModal
	bind:open={showForm}
	title={editingRecipe ? editingRecipe.name : m.recipes_new()}
	description={editingRecipe ? undefined : m.recipes_new_description()}
>
	{#if editingRecipe}
		{#key editingRecipe.id}
			<RecipeEditForm
				recipe={editingRecipe}
				{imageUrl={editImageUrl}}
				onSave={updateRecipe}
				onImageUpload={handleImageUpload}
			/>
		{/key}
	{:else}
		<RecipeForm {foods} onSave={createRecipe} />
	{/if}
</ResponsiveModal>
```

Note: The `{#key editingRecipe.id}` ensures the edit form re-mounts when switching between different recipes.

**Step 3: Delete the old recipe detail page**

Delete `src/routes/(app)/recipes/[id]/+page.svelte` and the `[id]` directory.

**Step 4: Fix references**

Search for any remaining references to `/recipes/[id]` or `goto('/recipes/')` patterns:

```bash
grep -r "recipes/\[id\]\|goto.*recipes/" src/ --include="*.svelte" --include="*.ts" -l
```

Fix any broken links.

**Step 5: Verify**

Run: `bun run check`
Expected: 0 errors

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: consolidate recipe edit/create into bottom sheet"
```

---

### Task 4: Clean up and verify

**Step 1: Search for dead references**

Check for any remaining references to the deleted pages:

```bash
grep -rn "foods/new\|/foods/\[" src/ --include="*.svelte" --include="*.ts"
grep -rn "/recipes/\[" src/ --include="*.svelte" --include="*.ts"
```

The API routes at `src/routes/api/foods/[id]/` and `src/routes/api/recipes/[id]/` should remain — only the page routes were deleted.

Also check navigation components (breadcrumbs, sidebar) for references to removed pages.

**Step 2: Run full type check**

Run: `bun run check`
Expected: 0 errors

**Step 3: Test manually**

Run: `bun run dev`

Checklist:

- [ ] Foods: click food in list → edit modal opens with data pre-filled
- [ ] Foods: edit food name, save → modal closes, list updates
- [ ] Foods: upload image in edit modal → image shows
- [ ] Foods: FAB → create modal opens empty
- [ ] Foods: create with barcode scan → stays in modal, OFF data loads
- [ ] Foods: navigate to `/foods?barcode=123` → modal auto-opens with barcode
- [ ] Recipes: click recipe in list → edit modal opens
- [ ] Recipes: edit recipe name, save → modal closes, list updates
- [ ] Recipes: FAB → create modal opens with ingredient form
- [ ] Recipes: upload image in edit modal → image shows
- [ ] All modals scroll on mobile (bottom sheet mode)

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: clean up dead references from page consolidation"
```
