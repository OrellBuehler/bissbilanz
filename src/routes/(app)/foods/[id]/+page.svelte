<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import NutriScoreSelector from '$lib/components/quality/NutriScoreSelector.svelte';
	import FoodQualityPanel from '$lib/components/quality/FoodQualityPanel.svelte';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { api } from '$lib/api/client';
	import { toast } from 'svelte-sonner';
	import * as Sentry from '@sentry/sveltekit';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import GitMerge from '@lucide/svelte/icons/git-merge';
	import ImageUploadField from '$lib/components/shared/ImageUploadField.svelte';
	import MergeFoodDialog from '$lib/components/foods/MergeFoodDialog.svelte';
	import { removeImage, uploadImage } from '$lib/utils/image-upload';
	import { round2 } from '$lib/utils/number';
	import * as m from '$lib/paraglide/messages';
	import { browser } from '$app/environment';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import { foodService } from '$lib/services/food-service.svelte';
	import type { components } from '$lib/api/generated/schema';

	const VALID_GRADES = ['a', 'b', 'c', 'd', 'e'] as const;
	type Grade = (typeof VALID_GRADES)[number];

	function toGrade(v: string | null): Grade | null {
		return VALID_GRADES.includes(v as Grade) ? (v as Grade) : null;
	}

	let saving = $state(false);
	let uploading = $state(false);
	let enriching = $state(false);
	let qualityOpen = $state(false);
	let initialized = $state(false);

	let name = $state('');
	let brand = $state('');
	let servingSize = $state(0);
	let calories = $state(0);
	let protein = $state(0);
	let carbs = $state(0);
	let fat = $state(0);
	let fiber = $state(0);
	let isFavorite = $state(false);
	let imageUrl: string | null = $state(null);
	let nutriScore = $state<Grade | null>(null);
	let novaGroup = $state<1 | 2 | 3 | 4 | null>(null);
	let additives = $state<string[] | null>(null);
	let ingredientsText = $state<string | null>(null);

	const foodId = $derived($page.params.id!);
	const foodQuery = useLiveQuery(() => foodService.foodById(foodId));
	const food = $derived(foodQuery.value);

	type Food = components['schemas']['Food'];
	let mergeOpen = $state(false);
	const allFoodsQuery = useLiveQuery(() => foodService.allFoods(), []);
	const allFoods = $derived((allFoodsQuery.value as unknown as Food[]) ?? []);

	const onMergeCompleted = () => {
		// This food is the merge source, so it no longer exists — leave the page.
		// Refresh before navigating so the foods list doesn't show a stale row.
		foodService.refresh();
		goto('/foods');
	};

	$effect(() => {
		if (browser) {
			foodService.refreshById(foodId);
		}
	});

	$effect(() => {
		if (food && !initialized) {
			name = food.name;
			brand = food.brand ?? '';
			servingSize = round2(food.servingSize);
			calories = round2(food.calories);
			protein = round2(food.protein);
			carbs = round2(food.carbs);
			fat = round2(food.fat);
			fiber = round2(food.fiber);
			isFavorite = food.isFavorite;
			imageUrl = food.imageUrl;
			nutriScore = toGrade(food.nutriScore);
			novaGroup = food.novaGroup as 1 | 2 | 3 | 4 | null;
			additives = food.additives;
			ingredientsText = food.ingredientsText;
			initialized = true;
		}
	});

	const handleImageUpload = async (file: File) => {
		if (!food || uploading) return;

		uploading = true;
		try {
			const newUrl = await uploadImage(file, { type: 'food', id: food.id });
			if (newUrl) imageUrl = newUrl;
		} finally {
			uploading = false;
		}
	};

	const handleImageRemove = async () => {
		if (!food || uploading) return;

		uploading = true;
		try {
			if (await removeImage({ type: 'food', id: food.id })) imageUrl = null;
		} finally {
			uploading = false;
		}
	};

	const toggleFavorite = async () => {
		if (!food) return;
		isFavorite = !isFavorite;
		await api.PATCH('/api/foods/{id}', {
			params: { path: { id: food.id } },
			body: { isFavorite }
		});
	};

	const saveChanges = async () => {
		if (!food) return;
		saving = true;
		try {
			const { error } = await api.PATCH('/api/foods/{id}', {
				params: { path: { id: food.id } },
				body: {
					name,
					brand: brand || null,
					servingSize,
					calories,
					protein,
					carbs,
					fat,
					fiber,
					isFavorite,
					imageUrl,
					nutriScore
				}
			});
			if (!error) {
				toast.success(m.detail_saved());
				foodService.refreshById(food.id);
			} else {
				toast.error(m.detail_save_failed());
			}
		} catch (err) {
			Sentry.captureException(err, { extra: { foodId: food?.id } });
			toast.error(m.detail_save_failed());
		} finally {
			saving = false;
		}
	};

	const enrichFood = async () => {
		if (!food?.barcode) return;
		enriching = true;
		try {
			const { data: offData, error: offError } = await api.GET('/api/openfoodfacts/{barcode}', {
				params: { path: { barcode: food.barcode } }
			});
			if (offError || !offData) {
				toast.error(m.quality_enrich_failed());
				return;
			}
			const { product } = offData;
			const { error: patchError } = await api.PATCH('/api/foods/{id}', {
				params: { path: { id: food.id } },
				body: {
					nutriScore: product.nutriScore,
					novaGroup: product.novaGroup,
					additives: product.additives,
					ingredientsText: product.ingredientsText,
					imageUrl: product.imageUrl
				}
			});
			if (patchError) {
				toast.error(m.quality_enrich_failed());
				return;
			}
			initialized = false;
			foodService.refreshById(food.id);
			toast.success(m.quality_enrich_success());
		} catch (err) {
			Sentry.captureException(err, { extra: { foodId: food.id } });
			toast.error(m.quality_enrich_failed());
		} finally {
			enriching = false;
		}
	};
</script>

<div class="mx-auto max-w-2xl space-y-6 pb-6">
	<div class="flex items-center gap-2">
		<Button variant="ghost" size="sm" class="shrink-0" href="/foods" aria-label={m.back_to_foods()}>
			<ArrowLeft class="size-4 sm:mr-1" />
			<span class="hidden sm:inline">{m.back_to_foods()}</span>
		</Button>
		<div class="ml-auto flex items-center gap-2">
			{#if food?.barcode}
				<Button
					variant="outline"
					size="sm"
					onclick={enrichFood}
					disabled={enriching}
					aria-label={m.quality_enrich()}
				>
					<Sparkles class="size-4 sm:mr-1" />
					<span class="hidden sm:inline"
						>{enriching ? m.quality_enriching() : m.quality_enrich()}</span
					>
				</Button>
			{/if}
			{#if food}
				<Button
					variant="outline"
					size="sm"
					onclick={() => (mergeOpen = true)}
					aria-label={m.foods_merge()}
				>
					<GitMerge class="size-4 sm:mr-1" />
					<span class="hidden sm:inline">{m.foods_merge()}</span>
				</Button>
			{/if}
		</div>
	</div>

	{#if !food && !initialized}
		<p class="text-muted-foreground">{m.favorites_loading()}</p>
	{:else if food}
		<ImageUploadField
			{name}
			{imageUrl}
			{uploading}
			onUpload={handleImageUpload}
			onRemove={handleImageRemove}
		/>

		<!-- Favorite toggle -->
		<div class="flex items-center gap-3">
			<Switch checked={isFavorite} onCheckedChange={toggleFavorite} />
			<Label>{m.mark_as_favorite()}</Label>
		</div>

		<Collapsible.Root bind:open={qualityOpen}>
			<Collapsible.Trigger
				class="flex w-full items-center justify-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
			>
				<ChevronDown class="size-4 transition-transform [[data-state=closed]_&]:-rotate-90" />
				{m.quality_title()}
			</Collapsible.Trigger>
			<Collapsible.Content>
				<FoodQualityPanel {novaGroup} {additives} {ingredientsText} />
			</Collapsible.Content>
		</Collapsible.Root>

		<!-- Editable fields -->
		<div class="grid gap-4">
			<div class="grid gap-2">
				<Label for="food-name">{m.food_form_name()}</Label>
				<Input id="food-name" bind:value={name} />
			</div>
			<div class="grid gap-2">
				<Label for="food-brand">{m.food_form_brand()}</Label>
				<Input id="food-brand" bind:value={brand} />
			</div>
			<div class="grid gap-2">
				<Label for="food-serving">{m.food_form_serving_size()}</Label>
				<Input id="food-serving" type="number" bind:value={servingSize} min="0" step="0.1" />
			</div>
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<div class="grid gap-2">
					<Label for="food-calories">{m.food_form_calories()}</Label>
					<Input id="food-calories" type="number" bind:value={calories} min="0" step="0.1" />
				</div>
				<div class="grid gap-2">
					<Label for="food-protein">{m.food_form_protein()}</Label>
					<Input id="food-protein" type="number" bind:value={protein} min="0" step="0.1" />
				</div>
				<div class="grid gap-2">
					<Label for="food-carbs">{m.food_form_carbs()}</Label>
					<Input id="food-carbs" type="number" bind:value={carbs} min="0" step="0.1" />
				</div>
				<div class="grid gap-2">
					<Label for="food-fat">{m.food_form_fat()}</Label>
					<Input id="food-fat" type="number" bind:value={fat} min="0" step="0.1" />
				</div>
				<div class="grid gap-2">
					<Label for="food-fiber">{m.food_form_fiber()}</Label>
					<Input id="food-fiber" type="number" bind:value={fiber} min="0" step="0.1" />
				</div>
			</div>
			<div class="grid gap-2">
				<Label>{m.quality_nutriscore()}</Label>
				<NutriScoreSelector value={nutriScore} onchange={(v) => (nutriScore = v)} />
			</div>
		</div>

		<Button class="w-full sm:w-auto" onclick={saveChanges} disabled={saving || uploading}>
			{saving ? m.detail_saving() : m.save_changes()}
		</Button>
	{/if}
</div>

{#if food}
	<MergeFoodDialog
		bind:open={mergeOpen}
		candidates={[food as unknown as Food]}
		{allFoods}
		onClose={() => (mergeOpen = false)}
		onCompleted={onMergeCompleted}
	/>
{/if}
