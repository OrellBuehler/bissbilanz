<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import NutriScoreBadge from '$lib/components/quality/NutriScoreBadge.svelte';
	import MoreVertical from '@lucide/svelte/icons/ellipsis-vertical';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import * as m from '$lib/paraglide/messages';

	type FoodItem = {
		id: string;
		name: string;
		brand?: string | null;
		barcode?: string | null;
		calories: number;
		protein: number;
		carbs: number;
		fat: number;
		servingSize: number;
		servingUnit: string;
		nutriScore?: string | null;
		isFavorite?: boolean;
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

	function macroTotal(food: FoodItem) {
		return food.protein + food.carbs + food.fat;
	}

	function pct(value: number, total: number) {
		if (total === 0) return 0;
		return (value / total) * 100;
	}
</script>

{#if foods.length === 0}
	<div class="flex flex-col items-center justify-center py-12 text-center">
		<p class="text-muted-foreground text-sm">{m.foods_empty()}</p>
	</div>
{:else}
	<div class="grid gap-2">
		{#each foods as food (food.id)}
			<button
				type="button"
				class="group flex w-full min-w-0 items-center gap-3 overflow-hidden rounded-xl border bg-card p-3 text-left transition-colors hover:bg-accent/50"
				onclick={() => onEdit(food.id)}
			>
				<!-- Calorie badge -->
				<div
					class="flex min-w-14 flex-col items-center rounded-lg bg-blue-50 px-2 py-1.5 dark:bg-blue-950"
				>
					<span class="text-lg font-bold leading-tight text-blue-600 dark:text-blue-400"
						>{Math.round(food.calories)}</span
					>
					<span
						class="text-[10px] font-medium uppercase tracking-wider text-blue-500/70 dark:text-blue-400/70"
						>{m.foods_kcal()}</span
					>
				</div>

				<!-- Name, brand, macro bars -->
				<div class="min-w-0 flex-1">
					<div class="flex min-w-0 items-center gap-2">
						<span class="min-w-0 flex-1 truncate font-medium">{food.name}</span>
						{#if food.nutriScore}
							<NutriScoreBadge score={food.nutriScore as 'a' | 'b' | 'c' | 'd' | 'e'} compact />
						{/if}
					</div>
					{#if food.brand}
						<p class="truncate text-xs text-muted-foreground">{food.brand}</p>
					{/if}
					<!-- Macro bars -->
					{#if macroTotal(food) > 0}
						<div class="mt-1.5 flex items-center gap-2">
							<div class="flex h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
								<div
									class="bg-red-400 dark:bg-red-500"
									style="width: {pct(food.protein, macroTotal(food))}%"
								></div>
								<div
									class="bg-orange-400 dark:bg-orange-500"
									style="width: {pct(food.carbs, macroTotal(food))}%"
								></div>
								<div
									class="bg-yellow-400 dark:bg-yellow-500"
									style="width: {pct(food.fat, macroTotal(food))}%"
								></div>
							</div>
							<span class="shrink-0 text-[10px] tabular-nums text-muted-foreground">
								{+food.protein.toFixed(1)}P {+food.carbs.toFixed(1)}C {+food.fat.toFixed(1)}F
							</span>
						</div>
					{/if}
				</div>

				<!-- Actions dropdown -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<div role="presentation" onclick={(e) => e.stopPropagation()}>
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button {...props} variant="ghost" size="icon" class="size-8 shrink-0">
									<MoreVertical class="size-4" />
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end">
							<DropdownMenu.Item onclick={() => onEdit(food.id)}>
								<Pencil class="mr-2 size-4" />
								{m.foods_edit()}
							</DropdownMenu.Item>
							{#if food.barcode && onEnrich}
								<DropdownMenu.Item
									disabled={enrichingId === food.id}
									onclick={() => handleEnrich(food)}
								>
									<Sparkles class="mr-2 size-4" />
									{enrichingId === food.id ? m.quality_enriching() : m.quality_enrich()}
								</DropdownMenu.Item>
							{/if}
							<DropdownMenu.Separator />
							<DropdownMenu.Item class="text-destructive" onclick={() => onDelete(food.id)}>
								<Trash2 class="mr-2 size-4" />
								{m.foods_delete()}
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</div>
			</button>
		{/each}
	</div>
{/if}
