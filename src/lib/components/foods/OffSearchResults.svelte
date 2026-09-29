<script lang="ts">
	import FoodThumbnail from '$lib/components/shared/FoodThumbnail.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import Plus from '@lucide/svelte/icons/plus';
	import * as m from '$lib/paraglide/messages';
	import type { components } from '$lib/api/generated/schema';

	type Props = {
		loading: boolean;
		results: components['schemas']['OpenFoodFactsProduct'][];
		onPick: (product: components['schemas']['OpenFoodFactsProduct']) => void;
	};

	let { loading, results, onPick }: Props = $props();
</script>

<div class="space-y-2">
	<p class="text-muted-foreground text-xs font-medium">{m.add_food_off_section()}</p>
	{#if loading}
		<p class="text-muted-foreground text-sm">{m.add_food_off_searching()}</p>
	{:else}
		<ul class="space-y-2">
			{#each results as product (product.barcode)}
				<li class="flex min-w-0 items-center justify-between gap-2 rounded-md border p-2">
					<FoodThumbnail name={product.name} imageUrl={product.imageUrl} size="sm" />
					<span class="min-w-0 flex-1 truncate text-sm">
						{product.name}
						{#if product.brand}<span class="text-muted-foreground"> · {product.brand}</span>{/if}
					</span>
					<Button
						variant="outline"
						size="sm"
						class="shrink-0"
						aria-label={m.add_food_add()}
						onclick={() => onPick(product)}
					>
						<Plus class="size-4 sm:mr-1" />
						<span class="hidden sm:inline">{m.add_food_add()}</span>
					</Button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
