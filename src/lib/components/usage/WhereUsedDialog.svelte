<script lang="ts">
	import { goto } from '$app/navigation';
	import { api } from '$lib/api/client';
	import type { components } from '$lib/api/generated/schema';
	import { ResponsiveModal } from '$lib/components/ui/responsive-modal/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { formatDateLabel } from '$lib/utils/dates';
	import * as Sentry from '@sentry/sveltekit';
	import { round2 } from '$lib/utils/number';
	import * as m from '$lib/paraglide/messages';

	type Usage = {
		entries: components['schemas']['UsageEntry'][];
		totalEntries: number;
		recipes: components['schemas']['FoodUsageRecipe'][];
		supplements: components['schemas']['FoodUsageSupplement'][];
	};

	type Props = {
		open: boolean;
		kind: 'recipe' | 'food';
		id: string | null;
		name: string;
	};

	let { open = $bindable(false), kind, id, name }: Props = $props();

	let usage = $state<Usage | null>(null);
	let loading = $state(false);
	let failed = $state(false);

	const load = async (targetId: string, targetKind: 'recipe' | 'food') => {
		loading = true;
		failed = false;
		usage = null;
		try {
			if (targetKind === 'recipe') {
				const { data } = await api.GET('/api/recipes/{id}/usage', {
					params: { path: { id: targetId } }
				});
				if (targetId !== id) return;
				usage = data ? { ...data, recipes: [], supplements: [] } : null;
			} else {
				const { data } = await api.GET('/api/foods/{id}/usage', {
					params: { path: { id: targetId } }
				});
				if (targetId !== id) return;
				usage = data ?? null;
			}
			failed = usage === null;
		} catch (err) {
			Sentry.captureException(err, { extra: { kind: targetKind, id: targetId } });
			failed = true;
		} finally {
			if (targetId === id) loading = false;
		}
	};

	$effect(() => {
		if (open && id) load(id, kind);
	});

	const openEntry = (entry: components['schemas']['UsageEntry']) => {
		open = false;
		goto(`/home?date=${entry.date}&entry=${entry.id}`);
	};

	const openRecipe = (recipeId: string) => {
		open = false;
		goto(`/recipes?edit=${recipeId}`);
	};

	const openSupplements = () => {
		open = false;
		goto('/supplements');
	};

	const isEmpty = $derived(
		usage !== null &&
			usage.totalEntries === 0 &&
			usage.recipes.length === 0 &&
			usage.supplements.length === 0
	);

	const rowClass = 'h-auto w-full justify-between gap-3 px-2 py-2 text-left font-normal';
</script>

<ResponsiveModal
	bind:open
	title={kind === 'recipe' ? m.usage_where_logged() : m.usage_where_used()}
	description={name}
>
	<div class="space-y-4 pb-2">
		{#if loading}
			<p class="text-sm text-muted-foreground">{m.usage_loading()}</p>
		{:else if failed}
			<p class="text-sm text-destructive">{m.usage_load_failed()}</p>
		{:else if isEmpty}
			<p class="text-sm text-muted-foreground">{m.usage_empty()}</p>
		{:else if usage}
			{#if usage.recipes.length > 0}
				<section class="space-y-1">
					<h3 class="text-sm font-medium">
						{m.usage_recipes_heading({ count: usage.recipes.length })}
					</h3>
					<ul>
						{#each usage.recipes as recipe (recipe.id)}
							<li>
								<Button variant="ghost" class={rowClass} onclick={() => openRecipe(recipe.id)}>
									<span class="min-w-0 truncate">{recipe.name}</span>
									<span class="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
										{#if recipe.isLastIngredient}
											{m.usage_last_ingredient()}
										{/if}
										<ChevronRight class="size-4" />
									</span>
								</Button>
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			{#if usage.supplements.length > 0}
				<section class="space-y-1">
					<h3 class="text-sm font-medium">
						{m.usage_supplements_heading({ count: usage.supplements.length })}
					</h3>
					<ul>
						{#each usage.supplements as supplement (supplement.id)}
							<li>
								<Button variant="ghost" class={rowClass} onclick={openSupplements}>
									<span class="min-w-0 truncate">{supplement.name}</span>
									<ChevronRight class="size-4 shrink-0 text-muted-foreground" />
								</Button>
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			{#if usage.totalEntries > 0}
				<section class="space-y-1">
					<h3 class="text-sm font-medium">
						{m.usage_entries_heading({ count: usage.totalEntries })}
					</h3>
					<ul>
						{#each usage.entries as entry (entry.id)}
							<li>
								<Button variant="ghost" class={rowClass} onclick={() => openEntry(entry)}>
									<span class="min-w-0 truncate">
										<span class="font-medium">{formatDateLabel(entry.date)}</span>
										<span class="text-muted-foreground"> · {entry.mealType}</span>
									</span>
									<span class="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
										{m.usage_servings({ count: round2(entry.servings) })}
										<ChevronRight class="size-4" />
									</span>
								</Button>
							</li>
						{/each}
					</ul>
					{#if usage.totalEntries > usage.entries.length}
						<p class="px-2 text-xs text-muted-foreground">
							{m.usage_showing_newest({ shown: usage.entries.length, total: usage.totalEntries })}
						</p>
					{/if}
				</section>
			{/if}
		{/if}
	</div>
</ResponsiveModal>
