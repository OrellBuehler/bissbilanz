<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
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

	let days = $state(7);
	let foods: TopFood[] = $state([]);
	let loading = $state(true);

	const loadTopFoods = async () => {
		loading = true;
		try {
			const res = await fetch(`/api/stats/top-foods?days=${days}&limit=10`);
			if (res.ok) {
				const data = await res.json();
				foods = data.data;
			}
		} catch {
			// silently ignore
		} finally {
			loading = false;
		}
	};

	$effect(() => {
		days;
		loadTopFoods();
	});

	onMount(() => {
		loadTopFoods();
	});
</script>

<div class="mx-auto max-w-4xl space-y-6">
	<h1 class="text-2xl font-semibold">{m.insights_title()}</h1>

	<Card.Root>
		<Card.Header>
			<div class="flex items-center justify-between">
				<Card.Title>{m.insights_top_foods()}</Card.Title>
				<div class="flex gap-1">
					<Button variant={days === 7 ? 'default' : 'outline'} size="sm" onclick={() => (days = 7)}>
						{m.insights_7d()}
					</Button>
					<Button
						variant={days === 30 ? 'default' : 'outline'}
						size="sm"
						onclick={() => (days = 30)}
					>
						{m.insights_30d()}
					</Button>
				</div>
			</div>
		</Card.Header>
		<Card.Content>
			{#if loading}
				<div class="flex justify-center py-8">
					<div
						class="border-muted-foreground/30 border-t-muted-foreground h-6 w-6 animate-spin rounded-full border-2"
					></div>
				</div>
			{:else if foods.length === 0}
				<p class="text-muted-foreground py-8 text-center text-sm">{m.insights_no_data()}</p>
			{:else}
				<div class="space-y-3">
					{#each foods as food, i}
						<div class="flex items-center gap-3 rounded-lg border p-3">
							<span
								class="bg-muted text-muted-foreground flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
							>
								{i + 1}
							</span>
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium">{food.foodName}</p>
								<div class="mt-0.5 flex flex-wrap gap-2 text-xs">
									<span class="text-muted-foreground"
										>{m.insights_times_logged({ count: food.count.toString() })}</span
									>
									<span class="text-muted-foreground">-</span>
									<span class="text-muted-foreground"
										>{food.calories} kcal {m.insights_per_serving()}</span
									>
								</div>
								<div class="mt-1 flex gap-3 text-xs">
									<span style="color: #EF4444">{food.protein}g P</span>
									<span style="color: #F97316">{food.carbs}g C</span>
									<span style="color: #EAB308">{food.fat}g F</span>
									<span style="color: #22C55E">{food.fiber}g Fi</span>
								</div>
							</div>
							<span class="shrink-0 text-right text-sm font-semibold tabular-nums">
								{food.calories} kcal
							</span>
						</div>
					{/each}
				</div>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
