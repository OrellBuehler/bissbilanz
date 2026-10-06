<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Replace from '@lucide/svelte/icons/replace';
	import Undo2 from '@lucide/svelte/icons/undo-2';
	import { MACRO_TEXT_CLASS } from '$lib/utils/colors';
	import * as m from '$lib/paraglide/messages';
	import FoodMappingSearch from './FoodMappingSearch.svelte';
	import type { MappedFood, MappingState, NewFoodItem } from './foodPackage';

	type Props = {
		/** New foods to show, including the ones already mapped (so the choice can be undone). */
		items: NewFoodItem[];
		/** How many of them the import would still create. */
		count: number;
		truncated?: boolean;
		mappings: MappingState;
		onMap: (ref: string, food: MappedFood) => void;
		onUnmap: (ref: string) => void;
	};

	let { items, count, truncated = false, mappings, onMap, onUnmap }: Props = $props();

	const PAGE = 20;

	let limit = $state(PAGE);
	let searching = $state<string | null>(null);

	const unit = (value: string) => value.replace('_', ' ');
</script>

<section class="space-y-3 rounded-lg border p-3" aria-labelledby="food-package-new-foods">
	<div class="space-y-1">
		<h3 id="food-package-new-foods" class="text-sm font-medium tabular-nums">
			{count === 1
				? m.food_package_new_foods_title_one()
				: m.food_package_new_foods_title({ count })}
		</h3>
		<p class="text-xs text-muted-foreground">{m.food_package_new_foods_hint()}</p>
		{#if truncated}
			<p class="text-xs text-muted-foreground">
				{m.food_package_new_foods_truncated({ shown: items.length })}
			</p>
		{/if}
	</div>

	<ul class="space-y-2">
		{#each items.slice(0, limit) as item (item.ref)}
			{@const mapped = mappings[item.ref]}
			<li class="space-y-2 rounded-md border p-2" class:opacity-70={!!mapped}>
				<div class="flex items-start justify-between gap-2">
					<div class="min-w-0">
						<p class="truncate text-sm font-medium" class:line-through={!!mapped}>{item.name}</p>
						<p class="truncate text-xs text-muted-foreground tabular-nums">
							{#if item.brand}{item.brand} ·
							{/if}{item.servingSize}
							{unit(item.servingUnit)} ·
							<span class={MACRO_TEXT_CLASS.calories}>{item.calories} kcal</span>
						</p>
					</div>
					<Badge variant={item.role === 'selected' ? 'secondary' : 'outline'} class="shrink-0">
						{item.role === 'selected'
							? m.food_package_role_selected()
							: m.food_package_role_ingredient()}
					</Badge>
				</div>
				{#if item.recipes.length > 0}
					<p class="text-xs text-muted-foreground">
						{m.food_package_used_in({
							recipes: item.recipes.map((recipe) => recipe.name).join(', ')
						})}
					</p>
				{/if}

				{#if mapped}
					<div class="flex items-center gap-2 rounded-md bg-muted/40 p-2">
						<ArrowRight class="size-4 shrink-0 text-muted-foreground" />
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium">
								{m.food_package_using({
									name: mapped.brand ? `${mapped.name} (${mapped.brand})` : mapped.name
								})}
							</p>
							<p class="text-xs text-muted-foreground">{m.food_package_using_note()}</p>
						</div>
						<Button variant="ghost" size="sm" onclick={() => onUnmap(item.ref)}>
							<Undo2 class="size-4" />
							{m.food_package_undo_mapping()}
						</Button>
					</div>
				{:else if searching === item.ref}
					<FoodMappingSearch
						{item}
						onSelect={(food) => {
							searching = null;
							onMap(item.ref, food);
						}}
						onCancel={() => (searching = null)}
					/>
				{:else}
					<Button variant="outline" size="sm" class="w-full" onclick={() => (searching = item.ref)}>
						<Replace class="size-4" />
						{m.food_package_use_own()}
					</Button>
				{/if}
			</li>
		{/each}
	</ul>

	{#if items.length > limit}
		<Button variant="outline" class="w-full" onclick={() => (limit += PAGE)}>
			{m.food_package_show_more()}
		</Button>
	{/if}
</section>
