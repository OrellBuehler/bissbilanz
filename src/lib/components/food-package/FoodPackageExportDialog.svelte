<script lang="ts">
	import { ResponsiveModal } from '$lib/components/ui/responsive-modal/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import Share2 from '@lucide/svelte/icons/share-2';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import { toast } from 'svelte-sonner';
	import * as Sentry from '@sentry/sveltekit';
	import * as m from '$lib/paraglide/messages';
	import FacetPicker from './FacetPicker.svelte';
	import { formatBytes, responseError, type FoodPackageSelection } from './foodPackage';
	import type { components } from '$lib/api/generated/schema';

	type Mode = 'all' | 'filter' | 'selected';
	type Summary = components['schemas']['FoodPackageSummaryResponse'];

	type Props = {
		open: boolean;
		/** Pre-selected foods (bulk selection) — enables the "Selected" mode. */
		foodIds?: string[];
		/** Pre-selected recipes (sharing from the recipes page). */
		recipeIds?: string[];
		/** Share recipes only by default (recipes page). */
		recipesOnly?: boolean;
	};

	let {
		open = $bindable(false),
		foodIds = [],
		recipeIds = [],
		recipesOnly = false
	}: Props = $props();

	const hasSelection = $derived(foodIds.length > 0 || recipeIds.length > 0);
	const selectedCount = $derived(foodIds.length + recipeIds.length);

	let mode = $state<Mode>('all');
	let includeRecipes = $state(true);
	let brands = $state<string[]>([]);
	let labels = $state<string[]>([]);
	let brandItems = $state<{ value: string; count: number }[]>([]);
	let labelItems = $state<{ value: string; count: number }[]>([]);
	let summary = $state<Summary | null>(null);
	let loadingSummary = $state(false);
	let exporting = $state(false);
	let facetsLoaded = false;

	$effect(() => {
		if (!open) return;
		mode = hasSelection ? 'selected' : 'all';
		includeRecipes = !hasSelection || recipesOnly;
		brands = [];
		labels = [];
	});

	async function loadFacets() {
		if (facetsLoaded) return;
		facetsLoaded = true;
		try {
			const [brandRes, labelRes] = await Promise.all([
				fetch('/api/foods/brands'),
				fetch('/api/foods/labels?kind=food')
			]);
			if (brandRes.ok) {
				const data = await brandRes.json();
				brandItems = data.brands.map((b: { brand: string; count: number }) => ({
					value: b.brand,
					count: b.count
				}));
			}
			if (labelRes.ok) {
				const data = await labelRes.json();
				labelItems = data.labels.map((l: { label: string; count: number }) => ({
					value: l.label,
					count: l.count
				}));
			}
		} catch (err) {
			facetsLoaded = false;
			Sentry.captureException(err);
		}
	}

	$effect(() => {
		if (open && mode === 'filter') loadFacets();
	});

	const selection = $derived.by((): FoodPackageSelection | null => {
		if (mode === 'all') {
			return recipesOnly
				? { includeRecipes: 'all' }
				: { all: true, includeRecipes: includeRecipes ? 'all' : 'none' };
		}
		if (mode === 'selected') {
			return {
				foodIds: foodIds.length ? foodIds : undefined,
				recipeIds: recipeIds.length ? recipeIds : undefined,
				includeRecipes: includeRecipes && foodIds.length ? 'related' : 'none'
			};
		}
		if (brands.length === 0 && labels.length === 0) return null;
		return {
			brands: brands.length ? brands : undefined,
			labels: labels.length ? labels : undefined,
			includeRecipes: includeRecipes ? 'related' : 'none'
		};
	});

	let summaryTimer: ReturnType<typeof setTimeout> | undefined;
	let summaryRequest = 0;
	$effect(() => {
		const current = selection;
		if (!open) return;
		clearTimeout(summaryTimer);
		if (!current) {
			summary = null;
			return;
		}
		const request = ++summaryRequest;
		loadingSummary = true;
		summaryTimer = setTimeout(async () => {
			try {
				const response = await fetch('/api/foods/package/summary', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(current)
				});
				if (request !== summaryRequest) return;
				summary = response.ok ? await response.json() : null;
			} catch (err) {
				Sentry.captureException(err);
				if (request === summaryRequest) summary = null;
			} finally {
				if (request === summaryRequest) loadingSummary = false;
			}
		}, 300);
	});

	const empty = $derived(!summary || summary.foods + summary.recipes === 0);

	async function exportPackage() {
		if (!selection || exporting) return;
		exporting = true;
		try {
			const response = await fetch('/api/foods/package/export', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(selection)
			});
			if (!response.ok) {
				toast.error((await responseError(response)) ?? m.food_package_export_failed());
				return;
			}
			const blob = await response.blob();
			const filename =
				response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ??
				'bissbilanz-foods.zip';
			const file = new File([blob], filename, { type: 'application/zip' });

			// Phones (and the installed PWA) can hand the file straight to a messenger.
			if (navigator.canShare?.({ files: [file] })) {
				try {
					await navigator.share({ files: [file], title: filename });
					open = false;
					return;
				} catch (err) {
					if ((err as DOMException)?.name === 'AbortError') return;
					// Fall through to a plain download.
				}
			}
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement('a');
			anchor.href = url;
			anchor.download = filename;
			anchor.click();
			URL.revokeObjectURL(url);
			open = false;
		} catch (err) {
			Sentry.captureException(err);
			toast.error(m.food_package_export_failed());
		} finally {
			exporting = false;
		}
	}
</script>

<ResponsiveModal
	bind:open
	title={m.food_package_export_title()}
	description={m.food_package_export_description()}
>
	<div class="space-y-4">
		{#if !recipesOnly}
			<ToggleGroup.Root
				type="single"
				variant="outline"
				class="w-full"
				value={mode}
				onValueChange={(value) => {
					if (value) mode = value as Mode;
				}}
			>
				<ToggleGroup.Item value="all" class="flex-1">{m.food_package_mode_all()}</ToggleGroup.Item>
				<ToggleGroup.Item value="filter" class="flex-1">
					{m.food_package_mode_filter()}
				</ToggleGroup.Item>
				{#if hasSelection}
					<ToggleGroup.Item value="selected" class="flex-1">
						{m.food_package_mode_selected({ count: selectedCount })}
					</ToggleGroup.Item>
				{/if}
			</ToggleGroup.Root>
		{:else if hasSelection}
			<ToggleGroup.Root
				type="single"
				variant="outline"
				class="w-full"
				value={mode}
				onValueChange={(value) => {
					if (value) mode = value as Mode;
				}}
			>
				<ToggleGroup.Item value="all" class="flex-1">{m.food_package_mode_all()}</ToggleGroup.Item>
				<ToggleGroup.Item value="selected" class="flex-1">
					{m.food_package_mode_selected({ count: selectedCount })}
				</ToggleGroup.Item>
			</ToggleGroup.Root>
		{/if}

		{#if mode === 'filter'}
			<p class="text-xs text-muted-foreground">{m.food_package_filter_hint()}</p>
			<FacetPicker label={m.food_package_brands()} items={brandItems} bind:selected={brands} />
			<FacetPicker label={m.food_package_labels()} items={labelItems} bind:selected={labels} />
		{/if}

		{#if !recipesOnly && !(mode === 'selected' && foodIds.length === 0)}
			<div class="flex items-center justify-between gap-3 rounded-lg border p-3">
				<Label for="food-package-recipes" class="text-sm font-normal">
					{mode === 'all'
						? m.food_package_include_recipes()
						: m.food_package_include_related_recipes()}
				</Label>
				<Switch id="food-package-recipes" bind:checked={includeRecipes} />
			</div>
		{/if}

		<div class="min-h-10 text-sm" aria-live="polite">
			{#if loadingSummary && !summary}
				<LoaderCircle class="size-4 animate-spin text-muted-foreground" />
			{:else if !selection || empty}
				<p class="text-muted-foreground">{m.food_package_nothing_selected()}</p>
			{:else if summary}
				<p class="font-medium tabular-nums" class:opacity-60={loadingSummary}>
					{m.food_package_summary({
						foods: summary.foods,
						recipes: summary.recipes,
						images: summary.images,
						size: formatBytes(summary.estimatedBytes)
					})}
				</p>
				{#if summary.ingredientFoods > 0}
					<p class="text-xs text-muted-foreground">
						{m.food_package_ingredients_added({ count: summary.ingredientFoods })}
					</p>
				{/if}
				{#if summary.overLimit}
					<p class="mt-1 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
						<TriangleAlert class="size-3.5" />
						{m.food_package_too_large()}
					</p>
				{/if}
			{/if}
		</div>

		<Button
			class="w-full"
			disabled={exporting || !selection || empty || summary?.overLimit}
			onclick={exportPackage}
		>
			{#if exporting}
				<LoaderCircle class="size-4 animate-spin" />
			{:else}
				<Share2 class="size-4" />
			{/if}
			{m.food_package_export_button()}
		</Button>
	</div>
</ResponsiveModal>
