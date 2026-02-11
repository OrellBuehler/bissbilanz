<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import NutriScoreBadge from '$lib/components/quality/NutriScoreBadge.svelte';
	import * as m from '$lib/paraglide/messages';

	type FoodItem = {
		id: string;
		name: string;
		brand?: string | null;
		barcode?: string | null;
		nutriScore?: string | null;
	};

	type Props = {
		foods?: FoodItem[];
		onEdit: (id: string) => void;
		onDelete: (id: string) => void;
		onEnrich?: (id: string, barcode: string) => void;
	};

	let { foods = [], onEdit, onDelete, onEnrich }: Props = $props();

	let enrichingId = $state<string | null>(null);

	async function handleEnrich(food: FoodItem) {
		if (!food.barcode || !onEnrich) return;
		enrichingId = food.id;
		try {
			await onEnrich(food.id, food.barcode);
		} finally {
			enrichingId = null;
		}
	}
</script>

<ul class="space-y-2">
	{#each foods as food}
		<Card.Root class="flex items-center justify-between p-3">
			<div class="flex items-center gap-3">
				<div>
					<div class="font-medium">{food.name}</div>
					{#if food.brand}
						<div class="text-sm text-muted-foreground">{food.brand}</div>
					{/if}
				</div>
				{#if food.nutriScore}
					<NutriScoreBadge score={food.nutriScore as 'a' | 'b' | 'c' | 'd' | 'e'} />
				{/if}
			</div>
			<div class="flex gap-2">
				{#if food.barcode && !food.nutriScore && onEnrich}
					<Button
						variant="outline"
						size="sm"
						disabled={enrichingId === food.id}
						onclick={() => handleEnrich(food)}
					>
						{enrichingId === food.id ? m.quality_enriching() : m.quality_enrich()}
					</Button>
				{/if}
				<Button variant="outline" size="sm" onclick={() => onEdit(food.id)}>{m.foods_edit()}</Button>
				<Button variant="outline" size="sm" onclick={() => onDelete(food.id)}>{m.foods_delete()}</Button>
			</div>
		</Card.Root>
	{/each}
</ul>
