<script lang="ts">
	import RecipeForm from '$lib/components/recipes/RecipeForm.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { ResponsiveModal } from '$lib/components/ui/responsive-modal/index.js';
	import DeleteButton from '$lib/components/ui/delete-button.svelte';
	import FoodThumbnail from '$lib/components/shared/FoodThumbnail.svelte';
	import DeleteBlockedDialog from '$lib/components/usage/DeleteBlockedDialog.svelte';
	import WhereUsedDialog from '$lib/components/usage/WhereUsedDialog.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import Star from '@lucide/svelte/icons/star';
	import CirclePlus from '@lucide/svelte/icons/circle-plus';
	import Copy from '@lucide/svelte/icons/copy';
	import ChefHat from '@lucide/svelte/icons/chef-hat';
	import Share2 from '@lucide/svelte/icons/share-2';
	import MoreVertical from '@lucide/svelte/icons/ellipsis-vertical';
	import FileArchive from '@lucide/svelte/icons/file-archive';
	import FoodPackageExportDialog from '$lib/components/food-package/FoodPackageExportDialog.svelte';
	import FoodPackageImportDialog from '$lib/components/food-package/FoodPackageImportDialog.svelte';
	import { toast } from 'svelte-sonner';
	import * as m from '$lib/paraglide/messages';
	import { removeImage, uploadImage, uploadImageFile } from '$lib/utils/image-upload';
	import type { RecipeFormPayload } from '$lib/components/recipes/RecipeForm.svelte';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { untrack } from 'svelte';
	import { db } from '$lib/db';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import { recipeService } from '$lib/services/recipe-service.svelte';
	import { foodService } from '$lib/services/food-service.svelte';
	import { requestQuickAction, consumeQuickAction } from '$lib/stores/command-palette.svelte';
	import { caloriesPerHundredGrams } from '$lib/utils/recipe-yield';
	import HintCard from '$lib/components/help/HintCard.svelte';
	import { isDismissed } from '$lib/stores/hints.svelte';
	import { filterRecipes } from '$lib/components/foods/foodFilters';
	import * as Sentry from '@sentry/sveltekit';

	type EditingRecipe = {
		id: string;
		name: string;
		totalServings: number;
		isFavorite: boolean;
		imageUrl: string | null;
		cookedWeight: number | null;
		calories: number | null;
		labels: string[];
		ingredients: Array<{ foodId: string; quantity: number; servingUnit: string }>;
		// null while the steps are not cached (opened offline before ever loading them).
		steps: Array<{ text: string; imageUrl: string | null }> | null;
	};

	let packageExportOpen = $state(false);
	let packageExportIds = $state<string[]>([]);
	let packageImportOpen = $state(false);
	let showForm = $state(false);
	let editingRecipe = $state<EditingRecipe | null>(null);
	let formImageUrl: string | null = $state(null);
	let uploading = $state(false);
	let blockedRecipe = $state<{ id: string; name: string; entryCount: number } | null>(null);
	let usageOpen = $state(false);
	let usageRecipe = $state<{ id: string; name: string } | null>(null);
	let editingExtendedNutrients: Record<string, number | null> | null = $state(null);

	let query = $state('');
	let sortBy = $state<'name' | 'recent' | 'calories'>('name');

	const recipesQuery = useLiveQuery(() => recipeService.allRecipes());
	const recipes = $derived(recipesQuery.value ?? []);

	const perServingCalories = (r: (typeof recipes)[number]) =>
		(r.calories ?? 0) / (r.totalServings > 0 ? r.totalServings : 1);

	const visibleRecipes = $derived(
		[...filterRecipes(recipes, query)].sort((a, b) => {
			if (sortBy === 'calories') return perServingCalories(a) - perServingCalories(b);
			if (sortBy === 'recent') {
				const aTime = a.updatedAt ?? a.createdAt ?? '';
				const bTime = b.updatedAt ?? b.createdAt ?? '';
				return bTime.localeCompare(aTime);
			}
			return a.name.localeCompare(b.name);
		})
	);

	$effect(() => {
		if (browser) {
			recipeService.refresh();
			void foodService.refresh();
		}
	});

	// A recipe linked from a "where it's used" list opens straight into its editor.
	$effect(() => {
		if (!browser) return;
		const editId = $page.url.searchParams.get('edit');
		if (!editId) return;
		untrack(() => openEdit(editId));
		goto('/recipes', { replaceState: true });
	});

	// "New recipe" from the command palette.
	$effect(() => {
		if (!consumeQuickAction(['new-recipe'])) return;
		editingRecipe = null;
		formImageUrl = null;
		editingExtendedNutrients = null;
		showForm = true;
	});

	const createRecipe = async (payload: RecipeFormPayload) => {
		const body = formImageUrl ? { ...payload, imageUrl: formImageUrl } : payload;
		const result = await recipeService.create(body);
		if (result.status === 'failed') {
			toast.error(m.detail_save_failed());
			return;
		}
		closeForm();
	};

	const updateRecipe = async (payload: RecipeFormPayload, labels?: string[]) => {
		if (!editingRecipe) return;
		const result = await recipeService.update(editingRecipe.id, payload);
		if (result.status === 'failed') {
			toast.error(m.detail_save_failed());
			return;
		}
		// Labels live in their own table: only an actual edit is sent, because a
		// user write is authoritative and replaces whatever a labeller had seeded.
		const before = editingRecipe.labels;
		if (
			labels &&
			(labels.length !== before.length || labels.some((label, i) => label !== before[i]))
		) {
			try {
				const dropped = await recipeService.setLabels(editingRecipe.id, labels);
				if (dropped.length > 0) {
					toast.info(m.detail_labels_dropped({ labels: dropped.join(', ') }));
				}
			} catch (err) {
				Sentry.captureException(err, { extra: { recipeId: editingRecipe.id } });
				toast.error(m.detail_save_failed());
				return;
			}
		}
		toast.success(m.detail_saved());
		closeForm();
	};

	const deleteRecipe = async (recipe: { id: string; name: string }) => {
		const result = await recipeService.delete(recipe.id);
		if (result.status === 'blocked') {
			blockedRecipe = { id: recipe.id, name: recipe.name, entryCount: result.entryCount };
		}
	};

	const showUsage = () => {
		if (!blockedRecipe) return;
		usageRecipe = { id: blockedRecipe.id, name: blockedRecipe.name };
		usageOpen = true;
	};

	const toggleFavorite = async (recipe: (typeof recipes)[number]) => {
		await recipeService.update(recipe.id, { isFavorite: !recipe.isFavorite });
	};

	const duplicateRecipe = async (recipe: (typeof recipes)[number]) => {
		const result = await recipeService.duplicate(
			recipe.id,
			m.recipe_copy_name({ name: recipe.name })
		);
		if (result.status === 'failed') {
			toast.error(m.detail_save_failed());
			return;
		}
		await openEdit(result.id);
	};

	const logRecipe = (recipeId: string) => {
		requestQuickAction({ type: 'add-food', recipeId });
		goto('/home');
	};

	const openEdit = async (id: string) => {
		// Best-effort refresh so an edit starts from the latest server copy;
		// offline (or a failed fetch) falls back to whatever is cached.
		const fresh = await recipeService.refreshById(id);
		editingExtendedNutrients = fresh?.extendedNutrientsPerServing ?? null;
		const recipe = await db.recipes.get(id);
		if (!recipe) return;
		const ingredients = await db.recipeIngredients.where('recipeId').equals(id).sortBy('sortOrder');
		const cachedSteps = await recipeService.cachedSteps(recipe);
		editingRecipe = {
			id: recipe.id,
			name: recipe.name,
			totalServings: recipe.totalServings,
			isFavorite: recipe.isFavorite,
			imageUrl: recipe.imageUrl,
			cookedWeight: recipe.cookedWeight,
			calories: recipe.calories,
			labels: recipe.labels ?? [],
			ingredients: ingredients.map((i) => ({
				foodId: i.foodId,
				quantity: i.quantity,
				servingUnit: i.servingUnit
			})),
			steps: cachedSteps?.map((step) => ({ text: step.text, imageUrl: step.imageUrl })) ?? null
		};
		formImageUrl = recipe.imageUrl;
		showForm = true;
	};

	const handleImageUpload = async (file: File) => {
		if (uploading) return;
		uploading = true;
		try {
			// Creating: there is no row to attach to yet, so the URL rides along in
			// the create body instead of a PATCH.
			const newUrl = editingRecipe
				? await uploadImage(file, { type: 'recipe', id: editingRecipe.id })
				: await uploadImageFile(file, 'recipe-create');
			if (newUrl) formImageUrl = newUrl;
		} finally {
			uploading = false;
		}
	};

	const handleStepImageUpload = (file: File) => uploadImageFile(file, 'recipe-step', 'recipe_step');

	const handleImageRemove = async () => {
		if (uploading) return;
		// Creating: nothing is attached yet, so dropping the pending URL is enough.
		if (!editingRecipe) {
			formImageUrl = null;
			return;
		}
		uploading = true;
		try {
			if (await removeImage({ type: 'recipe', id: editingRecipe.id })) formImageUrl = null;
		} finally {
			uploading = false;
		}
	};

	const closeForm = () => {
		showForm = false;
		editingRecipe = null;
		formImageUrl = null;
		editingExtendedNutrients = null;
	};

	const fmt = (n: number) => Math.round(n);

	const cookedWeightSubtitle = (r: (typeof recipes)[number]) => {
		if (!r.cookedWeight) return null;
		const per100g = caloriesPerHundredGrams(r.calories ?? 0, r.cookedWeight);
		return m.recipes_cooked_weight_subtitle({
			grams: String(Math.round(r.cookedWeight)),
			kcal: String(Math.round(per100g ?? 0))
		});
	};
</script>

<div class="mx-auto max-w-2xl space-y-4 pb-4">
	{#if !isDismissed('recipes')}
		<HintCard
			id="recipes"
			title={m.hint_recipes_title()}
			text={m.hint_recipes_body()}
			href="/help/recipes"
		/>
	{/if}

	<div class="flex flex-wrap items-center gap-2">
		<Button variant="outline" size="sm" onclick={() => (packageImportOpen = true)}>
			<FileArchive class="size-4 sm:mr-1" />
			<span class="hidden sm:inline">{m.food_package_import_recipes()}</span>
		</Button>
		{#if recipes.length > 0}
			<Button
				variant="outline"
				size="sm"
				onclick={() => {
					packageExportIds = [];
					packageExportOpen = true;
				}}
			>
				<Share2 class="size-4 sm:mr-1" />
				<span class="hidden sm:inline">{m.food_package_share_recipes()}</span>
			</Button>
		{/if}
	</div>

	{#if recipes.length > 0}
		<div class="flex gap-2">
			<div class="relative flex-1">
				<Search class="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input placeholder={m.recipes_search_placeholder()} bind:value={query} class="pl-8" />
			</div>
			<Select.Root
				type="single"
				value={sortBy}
				onValueChange={(v) => v && (sortBy = v as typeof sortBy)}
			>
				<Select.Trigger class="w-40 shrink-0">
					{sortBy === 'recent'
						? m.recipes_sort_recent()
						: sortBy === 'calories'
							? m.recipes_sort_calories()
							: m.recipes_sort_name()}
				</Select.Trigger>
				<Select.Content>
					<Select.Item value="name">{m.recipes_sort_name()}</Select.Item>
					<Select.Item value="recent">{m.recipes_sort_recent()}</Select.Item>
					<Select.Item value="calories">{m.recipes_sort_calories()}</Select.Item>
				</Select.Content>
			</Select.Root>
		</div>
	{/if}

	{#if recipes.length === 0}
		<p class="py-8 text-center text-sm text-muted-foreground">{m.recipes_no_recipes()}</p>
	{:else if visibleRecipes.length === 0}
		<p class="py-8 text-center text-sm text-muted-foreground">{m.recipes_no_results()}</p>
	{:else}
		<div class="space-y-2">
			{#each visibleRecipes as recipe (recipe.id)}
				<Card.Root
					class="cursor-pointer transition-colors hover:bg-accent/50"
					onclick={() => openEdit(recipe.id)}
				>
					<Card.Content class="flex items-center justify-between gap-3 p-4">
						<FoodThumbnail name={recipe.name} imageUrl={recipe.imageUrl} size="md" />
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
								<span class="truncate font-medium">{recipe.name}</span>
								<span class="shrink-0 text-xs text-muted-foreground">
									{m.recipes_servings({ count: recipe.totalServings })}
								</span>
							</div>
							<div class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
								<span class="font-medium text-blue-500">{fmt(recipe.calories ?? 0)} kcal</span>
								<span class="text-red-500">{fmt(recipe.protein ?? 0)}g P</span>
								<span class="text-orange-500">{fmt(recipe.carbs ?? 0)}g C</span>
								<span class="text-yellow-600">{fmt(recipe.fat ?? 0)}g F</span>
							</div>
							{#if recipe.stepCount}
								<p class="mt-1 text-xs text-muted-foreground">
									{m.recipe_step_count({ count: recipe.stepCount })}
								</p>
							{/if}
							{#if cookedWeightSubtitle(recipe)}
								<p class="mt-1 text-xs text-muted-foreground">{cookedWeightSubtitle(recipe)}</p>
							{/if}
						</div>
						<div class="flex shrink-0 items-center">
							<Button
								variant="ghost"
								size="icon"
								aria-label={recipe.isFavorite ? m.foods_bulk_unfavorite() : m.foods_bulk_favorite()}
								onclick={(e) => {
									e.stopPropagation();
									toggleFavorite(recipe);
								}}
							>
								<Star
									class={recipe.isFavorite
										? 'size-4 fill-yellow-400 text-yellow-400'
										: 'size-4 text-muted-foreground'}
								/>
							</Button>
							<Button
								variant="ghost"
								size="icon"
								aria-label={m.favorites_log()}
								onclick={(e) => {
									e.stopPropagation();
									logRecipe(recipe.id);
								}}
							>
								<CirclePlus class="size-4" />
							</Button>
							{#if recipe.stepCount}
								<Button
									variant="ghost"
									size="icon"
									class="hidden sm:inline-flex"
									aria-label={m.recipe_start_cooking()}
									onclick={(e) => {
										e.stopPropagation();
										goto(`/recipes/${recipe.id}/cook`);
									}}
								>
									<ChefHat class="size-4" />
								</Button>
							{/if}
							<Button
								variant="ghost"
								size="icon"
								class="hidden sm:inline-flex"
								aria-label={m.recipes_duplicate()}
								onclick={(e) => {
									e.stopPropagation();
									duplicateRecipe(recipe);
								}}
							>
								<Copy class="size-4" />
							</Button>
							<Button
								variant="ghost"
								size="icon"
								class="hidden sm:inline-flex"
								aria-label={m.food_package_share_recipe()}
								onclick={(e) => {
									e.stopPropagation();
									packageExportIds = [recipe.id];
									packageExportOpen = true;
								}}
							>
								<Share2 class="size-4" />
							</Button>
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<div role="presentation" class="sm:hidden" onclick={(e) => e.stopPropagation()}>
								<DropdownMenu.Root>
									<DropdownMenu.Trigger>
										{#snippet child({ props })}
											<Button
												{...props}
												variant="ghost"
												size="icon"
												aria-label={m.common_actions()}
											>
												<MoreVertical class="size-4" />
											</Button>
										{/snippet}
									</DropdownMenu.Trigger>
									<DropdownMenu.Content align="end">
										{#if recipe.stepCount}
											<DropdownMenu.Item onclick={() => goto(`/recipes/${recipe.id}/cook`)}>
												<ChefHat class="mr-2 size-4" />
												{m.recipe_start_cooking()}
											</DropdownMenu.Item>
										{/if}
										<DropdownMenu.Item onclick={() => duplicateRecipe(recipe)}>
											<Copy class="mr-2 size-4" />
											{m.recipes_duplicate()}
										</DropdownMenu.Item>
										<DropdownMenu.Item
											onclick={() => {
												packageExportIds = [recipe.id];
												packageExportOpen = true;
											}}
										>
											<Share2 class="mr-2 size-4" />
											{m.food_package_share_recipe()}
										</DropdownMenu.Item>
									</DropdownMenu.Content>
								</DropdownMenu.Root>
							</div>
							<DeleteButton onDelete={() => deleteRecipe(recipe)} title={m.recipes_delete()} />
						</div>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{/if}
</div>

<Button
	size="icon"
	class="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-6 z-50 size-14 rounded-full shadow-lg md:bottom-6"
	aria-label={m.recipes_new()}
	onclick={() => {
		editingRecipe = null;
		formImageUrl = null;
		editingExtendedNutrients = null;
		showForm = true;
	}}
>
	<Plus class="size-6" />
</Button>

<FoodPackageExportDialog bind:open={packageExportOpen} recipeIds={packageExportIds} recipesOnly />

<FoodPackageImportDialog bind:open={packageImportOpen} />

<ResponsiveModal
	bind:open={showForm}
	title={editingRecipe ? editingRecipe.name : m.recipes_new()}
	description={editingRecipe ? undefined : m.recipes_new_description()}
>
	{#key editingRecipe?.id ?? 'new'}
		<RecipeForm
			recipe={editingRecipe}
			imageUrl={formImageUrl}
			{uploading}
			extendedNutrients={editingExtendedNutrients}
			onSave={editingRecipe ? updateRecipe : createRecipe}
			onImageUpload={handleImageUpload}
			onImageRemove={handleImageRemove}
			cookHref={editingRecipe ? `/recipes/${editingRecipe.id}/cook` : undefined}
			onUploadStepImage={handleStepImageUpload}
		/>
	{/key}
</ResponsiveModal>

<DeleteBlockedDialog
	open={blockedRecipe !== null}
	title={m.recipes_delete_blocked_title()}
	description={m.recipes_delete_blocked({ count: blockedRecipe?.entryCount ?? 0 })}
	actionLabel={m.usage_where_logged()}
	onAction={showUsage}
	onClose={() => (blockedRecipe = null)}
/>

<WhereUsedDialog
	bind:open={usageOpen}
	kind="recipe"
	id={usageRecipe?.id ?? null}
	name={usageRecipe?.name ?? ''}
/>
