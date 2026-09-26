<script lang="ts">
	import { ResponsiveModal } from '$lib/components/ui/responsive-modal/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Info from '@lucide/svelte/icons/info';
	import { toast } from 'svelte-sonner';
	import * as Sentry from '@sentry/sveltekit';
	import * as m from '$lib/paraglide/messages';
	import { foodService } from '$lib/services/food-service.svelte';
	import { recipeService } from '$lib/services/recipe-service.svelte';
	import FoodConflictCard from './FoodConflictCard.svelte';
	import RecipeConflictCard from './RecipeConflictCard.svelte';
	import ResolutionToggle from './ResolutionToggle.svelte';
	import {
		applyToAll,
		buildResolutions,
		commonAction,
		initialResolutions,
		responseError,
		setResolution,
		type FoodPackageImportResult,
		type FoodPackagePreview,
		type PackageAction,
		type ResolutionState
	} from './foodPackage';

	type Props = {
		open: boolean;
		onImported?: (result: FoodPackageImportResult) => void;
	};

	let { open = $bindable(false), onImported }: Props = $props();

	const PAGE = 20;

	let file = $state<File | null>(null);
	let preview = $state<FoodPackagePreview | null>(null);
	let result = $state<FoodPackageImportResult | null>(null);
	let analyzing = $state(false);
	let importing = $state(false);
	let foodState = $state<ResolutionState>({});
	let recipeState = $state<ResolutionState>({});
	let foodLimit = $state(PAGE);
	let recipeLimit = $state(PAGE);
	let tab = $state<'foods' | 'recipes'>('foods');

	$effect(() => {
		if (!open) {
			file = null;
			preview = null;
			result = null;
			analyzing = false;
			importing = false;
		}
	});

	const foodConflicts = $derived(preview?.conflicts.foods ?? []);
	const recipeConflicts = $derived(preview?.conflicts.recipes ?? []);
	const conflictCount = $derived(foodConflicts.length + recipeConflicts.length);

	async function analyze(selected: File) {
		analyzing = true;
		try {
			const body = new FormData();
			body.append('file', selected);
			const response = await fetch('/api/foods/package/preview', { method: 'POST', body });
			if (!response.ok) {
				toast.error((await responseError(response)) ?? m.food_package_import_failed());
				file = null;
				return;
			}
			const data = (await response.json()) as FoodPackagePreview;
			preview = data;
			foodState = initialResolutions(data.conflicts.foods);
			recipeState = initialResolutions(data.conflicts.recipes);
			foodLimit = PAGE;
			recipeLimit = PAGE;
			tab =
				data.conflicts.foods.length > 0 || data.conflicts.recipes.length === 0
					? 'foods'
					: 'recipes';
		} catch (err) {
			Sentry.captureException(err);
			toast.error(m.food_package_import_failed());
			file = null;
		} finally {
			analyzing = false;
		}
	}

	async function onFileChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const selected = input.files?.[0] ?? null;
		input.value = '';
		if (!selected) return;
		file = selected;
		preview = null;
		await analyze(selected);
	}

	async function commit() {
		if (!file || !preview || importing) return;
		importing = true;
		try {
			const body = new FormData();
			body.append('file', file);
			body.append(
				'resolutions',
				new Blob([JSON.stringify(buildResolutions(preview, foodState, recipeState))], {
					type: 'application/json'
				})
			);
			const response = await fetch('/api/foods/package/import', { method: 'POST', body });
			if (response.status === 409) {
				toast.warning(m.food_package_stale());
				await analyze(file);
				return;
			}
			if (!response.ok) {
				toast.error((await responseError(response)) ?? m.food_package_import_failed());
				return;
			}
			result = (await response.json()) as FoodPackageImportResult;
			toast.success(
				m.food_package_import_success({
					foods: result.created.foods + result.replaced.foods + result.keptBoth.foods,
					recipes: result.created.recipes + result.replaced.recipes + result.keptBoth.recipes
				})
			);
			await Promise.all([foodService.refresh(), recipeService.refresh()]);
			onImported?.(result);
		} catch (err) {
			Sentry.captureException(err);
			toast.error(m.food_package_import_failed());
		} finally {
			importing = false;
		}
	}

	const resultLine = (kind: 'foods' | 'recipes') =>
		result
			? m.food_package_result_line({
					created: result.created[kind],
					replaced: result.replaced[kind],
					keptBoth: result.keptBoth[kind],
					skipped: result.skipped[kind]
				})
			: '';
</script>

{#snippet applyAll(value: PackageAction | null, onChange: (action: PackageAction) => void)}
	<div class="space-y-1.5 rounded-lg bg-muted/40 p-2">
		<p class="text-xs font-medium text-muted-foreground">
			{value
				? m.food_package_apply_all()
				: `${m.food_package_apply_all()} · ${m.food_package_mixed()}`}
		</p>
		<ResolutionToggle {value} {onChange} />
	</div>
{/snippet}

<ResponsiveModal
	bind:open
	openFull={!!preview || !!result}
	title={m.food_package_import_title()}
	description={m.food_package_import_description()}
>
	<div class="space-y-4">
		{#if result}
			<div class="space-y-3 rounded-lg border p-4">
				<p class="flex items-center gap-2 font-medium">
					<CircleCheck class="size-5 text-green-600 dark:text-green-400" />
					{m.food_package_result_title()}
				</p>
				<p class="text-sm">
					<span class="font-medium">{m.food_package_foods()}:</span>
					{resultLine('foods')}
				</p>
				{#if result.created.recipes + result.replaced.recipes + result.keptBoth.recipes + result.skipped.recipes > 0}
					<p class="text-sm">
						<span class="font-medium">
							{m.food_package_recipes()}:
						</span>
						{resultLine('recipes')}
					</p>
				{/if}
				{#if result.issues.length > 0}
					<ul class="max-h-32 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
						{#each result.issues as issue, index (index)}
							<li>{issue.message}</li>
						{/each}
					</ul>
				{/if}
			</div>
			<Button class="w-full" onclick={() => (open = false)}>{m.food_package_done()}</Button>
		{:else}
			<Input
				type="file"
				accept=".zip,application/zip,application/x-zip-compressed,.json,application/json"
				aria-label={m.food_package_choose_file()}
				disabled={analyzing || importing}
				onchange={onFileChange}
			/>

			{#if analyzing}
				<p class="flex items-center gap-2 text-sm text-muted-foreground">
					<LoaderCircle class="size-4 animate-spin" />
					{m.food_package_analyzing()}
				</p>
			{:else if preview}
				<div class="space-y-1 rounded-lg border p-3">
					<p class="text-sm font-medium tabular-nums">
						{m.food_package_new_counts({
							foods: preview.newFoods.count,
							recipes: preview.newRecipes.count
						})}
					</p>
					{#if preview.newFoods.ingredientOnly > 0}
						<p class="text-xs text-muted-foreground">
							{m.food_package_ingredient_only({ count: preview.newFoods.ingredientOnly })}
						</p>
					{/if}
					<p class="text-xs text-muted-foreground">
						{conflictCount > 0
							? m.food_package_conflict_count({ count: conflictCount })
							: m.food_package_no_conflicts()}
					</p>
					{#if preview.issues.length > 0}
						<details class="text-xs text-muted-foreground">
							<summary class="flex cursor-pointer items-center gap-1.5">
								<Info class="size-3.5" />
								{m.food_package_issues({ count: preview.issues.length })}
							</summary>
							<ul class="mt-1 max-h-32 space-y-0.5 overflow-y-auto">
								{#each preview.issues as issue, index (index)}
									<li>{issue.message}</li>
								{/each}
							</ul>
						</details>
					{/if}
				</div>

				{#if conflictCount > 0}
					<Tabs.Root value={tab} onValueChange={(value) => (tab = value as 'foods' | 'recipes')}>
						{#if foodConflicts.length > 0 && recipeConflicts.length > 0}
							<Tabs.List class="w-full">
								<Tabs.Trigger value="foods" class="flex-1">
									{m.food_package_tab_foods({ count: foodConflicts.length })}
								</Tabs.Trigger>
								<Tabs.Trigger value="recipes" class="flex-1">
									{m.food_package_tab_recipes({ count: recipeConflicts.length })}
								</Tabs.Trigger>
							</Tabs.List>
						{/if}
						<Tabs.Content value="foods" class="space-y-3">
							{#if foodConflicts.length > 1}
								{@render applyAll(commonAction(foodConflicts, foodState), (action) => {
									foodState = applyToAll(foodConflicts, action);
								})}
							{/if}
							{#each foodConflicts.slice(0, foodLimit) as conflict (conflict.ref)}
								<FoodConflictCard
									{conflict}
									value={foodState[conflict.ref] ?? 'skip'}
									onChange={(action) => {
										foodState = setResolution(foodState, foodConflicts, conflict.ref, action);
									}}
								/>
							{/each}
							{#if foodConflicts.length > foodLimit}
								<Button variant="outline" class="w-full" onclick={() => (foodLimit += PAGE)}>
									{m.food_package_show_more()}
								</Button>
							{/if}
						</Tabs.Content>
						<Tabs.Content value="recipes" class="space-y-3">
							{#if recipeConflicts.length > 1}
								{@render applyAll(commonAction(recipeConflicts, recipeState), (action) => {
									recipeState = applyToAll(recipeConflicts, action);
								})}
							{/if}
							{#each recipeConflicts.slice(0, recipeLimit) as conflict (conflict.ref)}
								<RecipeConflictCard
									{conflict}
									value={recipeState[conflict.ref] ?? 'skip'}
									onChange={(action) => {
										recipeState = setResolution(recipeState, recipeConflicts, conflict.ref, action);
									}}
								/>
							{/each}
							{#if recipeConflicts.length > recipeLimit}
								<Button variant="outline" class="w-full" onclick={() => (recipeLimit += PAGE)}>
									{m.food_package_show_more()}
								</Button>
							{/if}
						</Tabs.Content>
					</Tabs.Root>
				{/if}

				<Button class="w-full" disabled={importing} onclick={commit}>
					{#if importing}<LoaderCircle class="size-4 animate-spin" />{/if}
					{m.food_package_import_button()}
				</Button>
			{/if}
		{/if}
	</div>
</ResponsiveModal>
