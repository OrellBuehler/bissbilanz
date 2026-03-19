<script lang="ts">
	import DashboardCard from '$lib/components/dashboard/DashboardCard.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import TrendingUp from '@lucide/svelte/icons/trending-up';
	import { statsService } from '$lib/services/stats-service.svelte';
	import { onMount } from 'svelte';
	import * as m from '$lib/paraglide/messages';

	type TopFood = {
		foodId: string | null;
		recipeId: string | null;
		foodName: string;
		count: number;
		calories: number;
		protein: number;
		carbs: number;
		fat: number;
		fiber: number;
	};

	let foods: TopFood[] = $state([]);
	let loading = $state(true);

	const loadTopFoods = async () => {
		try {
			const result = await statsService.getTopFoods(7, 3);
			if (result) {
				foods = result.data;
			}
		} catch {
			// silently ignore
		} finally {
			loading = false;
		}
	};

	onMount(() => {
		loadTopFoods();
	});
</script>

<DashboardCard title={m.insights_top_foods()} Icon={TrendingUp} tone="emerald">
	{#snippet headerRight()}
		<Button variant="ghost" size="sm" href="/insights" class="text-xs">
			{m.insights_see_more()}
		</Button>
	{/snippet}

	{#if loading}
		<div class="flex justify-center py-4">
			<div
				class="border-muted-foreground/30 border-t-muted-foreground h-5 w-5 animate-spin rounded-full border-2"
			></div>
		</div>
	{:else if foods.length === 0}
		<p class="text-muted-foreground py-2 text-sm">{m.insights_no_data()}</p>
	{:else}
		<div class="space-y-2">
			{#each foods as food, i}
				<div class="flex items-center gap-3">
					<span
						class="bg-muted text-muted-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium"
					>
						{i + 1}
					</span>
					<span class="min-w-0 flex-1 truncate text-sm font-medium">{food.foodName}</span>
					<span class="text-muted-foreground shrink-0 text-xs">{food.count}x</span>
					<span class="shrink-0 text-right text-xs tabular-nums"
						>{Math.round(food.calories)} kcal</span
					>
				</div>
			{/each}
		</div>
	{/if}
</DashboardCard>
