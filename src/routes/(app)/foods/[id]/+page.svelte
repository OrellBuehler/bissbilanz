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
	import { apiFetch } from '$lib/utils/api';
	import { api } from '$lib/api/client';
	import { toast } from 'svelte-sonner';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import * as Sentry from '@sentry/sveltekit';
	import Spinner from '$lib/components/ui/spinner/spinner.svelte';
	import { round2 } from '$lib/utils/number';
	import * as m from '$lib/paraglide/messages';
	import { browser } from '$app/environment';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import { foodService } from '$lib/services/food-service.svelte';

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

	const PALETTE = [
		{ bg: 'bg-rose-200', text: 'text-rose-700' },
		{ bg: 'bg-sky-200', text: 'text-sky-700' },
		{ bg: 'bg-amber-200', text: 'text-amber-700' },
		{ bg: 'bg-emerald-200', text: 'text-emerald-700' },
		{ bg: 'bg-violet-200', text: 'text-violet-700' },
		{ bg: 'bg-orange-200', text: 'text-orange-700' },
		{ bg: 'bg-teal-200', text: 'text-teal-700' },
		{ bg: 'bg-pink-200', text: 'text-pink-700' }
	];

	const colorIndex = $derived(
		name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % PALETTE.length
	);
	const placeholderColor = $derived(PALETTE[colorIndex]);
	const initial = $derived(name.charAt(0).toUpperCase());

	const handleImageUpload = async (e: Event) => {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file || !food || uploading) return;

		uploading = true;
		const formData = new FormData();
		formData.append('image', file);

		try {
			const uploadRes = await apiFetch('/api/images/upload', {
				method: 'POST',
				body: formData
			});
			if (!uploadRes.ok) {
				const body = await uploadRes.text().catch(() => '');
				Sentry.logger.error('Image upload failed', {
					status: uploadRes.status,
					body: body.slice(0, 500),
					fileSize: file.size,
					fileType: file.type,
					context: 'food-detail'
				});
				toast.error(m.image_upload_failed());
				return;
			}
			const { imageUrl: newUrl } = await uploadRes.json();
			imageUrl = newUrl;

			await api.PATCH('/api/foods/{id}', {
				params: { path: { id: food.id } },
				body: { imageUrl: newUrl }
			});
			toast.success(m.image_uploaded());
		} catch (err) {
			Sentry.captureException(err, { extra: { fileSize: file.size, fileType: file.type } });
			toast.error(m.image_upload_failed());
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
		} catch {
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
		} catch {
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
		{#if food?.barcode}
			<Button
				variant="outline"
				size="sm"
				class="ml-auto"
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
	</div>

	{#if !food && !initialized}
		<p class="text-muted-foreground">{m.favorites_loading()}</p>
	{:else if food}
		<!-- Image section -->
		<div class="relative aspect-video w-full max-w-sm overflow-hidden rounded-xl border">
			{#if imageUrl}
				<img src={imageUrl} alt={name} class="h-full w-full object-cover" />
			{:else}
				<div class="flex h-full w-full items-center justify-center {placeholderColor.bg}">
					<span class="text-6xl font-bold {placeholderColor.text}">{initial}</span>
				</div>
			{/if}
			{#if uploading}
				<div class="absolute inset-0 flex items-center justify-center bg-background/60">
					<Spinner class="size-8" />
				</div>
			{/if}
		</div>
		<div>
			<Label for="image-upload">{m.image_upload_label()}</Label>
			<input
				id="image-upload"
				type="file"
				accept="image/*"
				disabled={uploading}
				onchange={handleImageUpload}
				class="mt-1 block w-full text-sm file:mr-4 file:rounded file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90 disabled:opacity-50"
			/>
		</div>

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
