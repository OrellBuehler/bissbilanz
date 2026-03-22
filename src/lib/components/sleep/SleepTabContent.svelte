<script lang="ts">
	import { onMount } from 'svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import Moon from '@lucide/svelte/icons/moon';
	import History from '@lucide/svelte/icons/history';
	import SleepLogForm from './SleepLogForm.svelte';
	import SleepTrendChart from './SleepTrendChart.svelte';
	import SleepHistoryList from './SleepHistoryList.svelte';
	import { useLiveQuery } from '$lib/db/live.svelte';
	import { sleepService } from '$lib/services/sleep-service.svelte';
	import type { DexieSleepEntry } from '$lib/db/types';
	import FoodSleepCard from '$lib/components/analytics/FoodSleepCard.svelte';
	import NutrientSleepCard from '$lib/components/analytics/NutrientSleepCard.svelte';
	import PreSleepWindowCard from '$lib/components/analytics/PreSleepWindowCard.svelte';
	import * as m from '$lib/paraglide/messages';

	const live = useLiveQuery(() => sleepService.entries(), [] as DexieSleepEntry[]);
	const entries = $derived(live.value);

	onMount(() => {
		sleepService.refresh();
	});
</script>

<div class="mx-auto max-w-4xl space-y-6 pb-8">
	<Card.Root class="overflow-hidden">
		<Card.Header class="pb-3">
			<div class="flex items-center gap-2">
				<div
					class="flex size-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400"
				>
					<Moon class="size-4" />
				</div>
				<Card.Title class="text-base tracking-tight">{m.sleep_log()}</Card.Title>
			</div>
		</Card.Header>
		<Card.Content class="p-4 pt-0 sm:p-5 sm:pt-0">
			{#if live.loading}
				<div class="bg-muted/50 h-32 animate-pulse rounded-xl"></div>
			{:else}
				<SleepLogForm onLogged={() => sleepService.refresh()} />
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root class="overflow-hidden">
		<Card.Content class="p-3 sm:p-4">
			{#if live.loading}
				<div class="bg-muted/50 h-[320px] animate-pulse rounded-xl"></div>
			{:else}
				<SleepTrendChart {entries} />
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root class="overflow-hidden">
		<Card.Header class="flex flex-row items-center justify-between gap-2 pb-3">
			<div class="flex items-center gap-2">
				<div
					class="flex size-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400"
				>
					<History class="size-4" />
				</div>
				<Card.Title class="text-base">{m.sleep_history()}</Card.Title>
			</div>
			<div
				class="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/80 px-2 py-1 text-[11px] font-medium tabular-nums text-muted-foreground"
			>
				<Moon class="size-3.5" />
				{entries.length}
			</div>
		</Card.Header>
		<Card.Content class="pt-0">
			{#if live.loading}
				<div class="bg-muted/50 h-32 animate-pulse rounded-xl"></div>
			{:else}
				<SleepHistoryList {entries} />
			{/if}
		</Card.Content>
	</Card.Root>

	<div class="space-y-4">
		<FoodSleepCard />
		<NutrientSleepCard />
		<PreSleepWindowCard />
	</div>
</div>
