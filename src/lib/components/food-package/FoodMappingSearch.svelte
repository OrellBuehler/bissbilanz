<script lang="ts">
	import { untrack } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import FoodThumbnail from '$lib/components/shared/FoodThumbnail.svelte';
	import Search from '@lucide/svelte/icons/search';
	import X from '@lucide/svelte/icons/x';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import { foodService } from '$lib/services/food-service.svelte';
	import * as m from '$lib/paraglide/messages';
	import {
		mappingCandidates,
		suggestedQuery,
		type MappedFood,
		type NewFoodItem
	} from './foodPackage';

	type Props = {
		item: Pick<NewFoodItem, 'name' | 'servingUnit'>;
		onSelect: (food: MappedFood) => void;
		onCancel: () => void;
	};

	let { item, onSelect, onCancel }: Props = $props();

	const LIMIT = 8;

	let query = $state(untrack(() => suggestedQuery(item.name)));
	// The Dexie mirror of the user's foods, the same source the food picker searches.
	const results = useLiveQuery(() => foodService.search(query), []);
	const candidates = $derived(mappingCandidates(results.value, item, LIMIT));
</script>

<div class="space-y-2 rounded-md bg-muted/40 p-2">
	<div class="flex items-center gap-2">
		<div class="relative min-w-0 flex-1">
			<Search
				class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
			/>
			<Input
				type="text"
				enterkeyhint="search"
				class="pl-8"
				bind:value={query}
				placeholder={m.food_package_search_own()}
				aria-label={m.food_package_search_own()}
			/>
		</div>
		<Button
			variant="ghost"
			size="icon"
			onclick={onCancel}
			aria-label={m.food_package_search_cancel()}
			title={m.food_package_search_cancel()}
		>
			<X class="size-4" />
		</Button>
	</div>
	<p class="text-xs text-muted-foreground">
		{m.food_package_search_own_hint({ unit: item.servingUnit.replace('_', ' ') })}
	</p>
	{#if candidates.length === 0}
		<p class="py-2 text-center text-sm text-muted-foreground">
			{m.food_package_search_own_empty()}
		</p>
	{:else}
		<ul class="space-y-1">
			{#each candidates as food (food.id)}
				<li>
					<Button
						variant="ghost"
						class="h-auto w-full justify-start gap-2 px-2 py-1.5 text-left"
						onclick={() => onSelect(food)}
					>
						<FoodThumbnail name={food.name} imageUrl={food.imageUrl} size="xs" />
						<span class="min-w-0 flex-1">
							<span class="block truncate text-sm font-medium">{food.name}</span>
							{#if food.brand}
								<span class="block truncate text-xs font-normal text-muted-foreground">
									{food.brand}
								</span>
							{/if}
						</span>
						<span class="shrink-0 text-xs font-normal text-muted-foreground tabular-nums">
							{food.servingSize}
							{food.servingUnit.replace('_', ' ')}
						</span>
					</Button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
