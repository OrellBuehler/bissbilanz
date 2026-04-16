<script lang="ts">
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import GitMerge from '@lucide/svelte/icons/git-merge';
	import { api } from '$lib/api/client';
	import * as m from '$lib/paraglide/messages';
	import type { components } from '$lib/api/generated/schema';
	import MergeFoodDialog from '$lib/components/foods/MergeFoodDialog.svelte';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import { foodService } from '$lib/services/food-service.svelte';

	type DuplicateGroup = components['schemas']['FoodDuplicateGroup'];
	type Food = components['schemas']['Food'];

	let groups = $state<DuplicateGroup[]>([]);
	let loading = $state(true);

	let mergeOpen = $state(false);
	let mergeCandidates = $state<Food[]>([]);

	const allFoodsQuery = useLiveQuery(() => foodService.allFoods(), []);
	const allFoods = $derived(allFoodsQuery.value as unknown as Food[]);

	async function refresh() {
		loading = true;
		try {
			const { data } = await api.GET('/api/foods/duplicates');
			groups = data?.groups ?? [];
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (browser) refresh();
	});

	function resolve(group: DuplicateGroup) {
		mergeCandidates = group.foods;
		mergeOpen = true;
	}
</script>

<div class="mx-auto max-w-2xl space-y-4 pb-4">
	<div class="flex items-center gap-2">
		<Button variant="ghost" size="icon" onclick={() => goto('/foods')}>
			<ArrowLeft class="size-4" />
		</Button>
		<div class="min-w-0 flex-1">
			<h1 class="truncate text-lg font-semibold">{m.foods_duplicates_title()}</h1>
			<p class="text-xs text-muted-foreground">{m.foods_duplicates_description()}</p>
		</div>
	</div>

	{#if loading}
		<div class="space-y-2">
			<Skeleton class="h-24 w-full" />
			<Skeleton class="h-24 w-full" />
		</div>
	{:else if groups.length === 0}
		<div class="rounded-md border bg-card p-8 text-center">
			<p class="text-sm text-muted-foreground">{m.foods_duplicates_empty()}</p>
		</div>
	{:else}
		<div class="space-y-3">
			{#each groups as group (group.reason + ':' + group.key)}
				<Card.Root>
					<Card.Header class="pb-3">
						<div class="flex items-center justify-between gap-2">
							<Badge variant="outline" class="text-[10px]">
								{group.reason === 'barcode'
									? m.foods_duplicates_reason_barcode()
									: m.foods_duplicates_reason_name_brand()}
							</Badge>
							<Button size="sm" onclick={() => resolve(group)}>
								<GitMerge class="mr-2 size-4" />
								{m.foods_duplicates_resolve()}
							</Button>
						</div>
					</Card.Header>
					<Card.Content class="space-y-2 pb-4">
						{#each group.foods as food (food.id)}
							<div
								class="flex items-center justify-between gap-3 rounded-md border bg-background p-2.5"
							>
								<div class="min-w-0 flex-1">
									<div class="flex items-center gap-2">
										<span class="truncate text-sm font-medium">{food.name}</span>
										{#if food.barcode}
											<Badge variant="secondary" class="font-mono text-[10px]">
												{food.barcode}
											</Badge>
										{/if}
									</div>
									{#if food.brand}
										<p class="truncate text-xs text-muted-foreground">{food.brand}</p>
									{/if}
								</div>
								<div class="shrink-0 text-right text-xs tabular-nums text-muted-foreground">
									{Math.round(food.calories)} kcal
								</div>
							</div>
						{/each}
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{/if}
</div>

<MergeFoodDialog
	bind:open={mergeOpen}
	candidates={mergeCandidates}
	{allFoods}
	onClose={() => (mergeOpen = false)}
	onCompleted={() => {
		foodService.refresh();
		refresh();
	}}
/>
