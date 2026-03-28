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
	import CaffeineSleepCard from '$lib/components/analytics/CaffeineSleepCard.svelte';
	import { today, shiftDate } from '$lib/utils/dates';
	import * as m from '$lib/paraglide/messages';

	type SleepFoodPoint = {
		date: string;
		eveningCalories: number | null;
		sleepDurationMinutes: number | null;
		sleepQuality: number | null;
	};

	type MealEntry = {
		date: string;
		mealType: string;
		eatenAt: string | null;
		foodId: string | null;
		recipeId: string | null;
		calories: number;
		foodName: string;
	};

	type DailyNutrient = {
		date: string;
		calories: number;
		protein: number;
		carbs: number;
		fat: number;
		fiber: number;
		[key: string]: number | string;
	};

	const live = useLiveQuery(() => sleepService.entries(), [] as DexieSleepEntry[]);
	const entries = $derived(live.value);

	let analyticsLoading = $state(true);
	let sleepFoodData = $state<SleepFoodPoint[]>([]);
	let mealEntries = $state<MealEntry[]>([]);
	let nutrientSeries = $state<DailyNutrient[]>([]);
	let sleepWithBedtime = $state<{ bedtime: string }[]>([]);

	onMount(async () => {
		sleepService.refresh();
		const endDate = today();
		const startDate = shiftDate(endDate, -59);
		try {
			const [sfRes, mRes, nRes, sleepRes] = await Promise.all([
				fetch(`/api/analytics/sleep-food?startDate=${startDate}&endDate=${endDate}`),
				fetch(`/api/analytics/meal-timing?startDate=${startDate}&endDate=${endDate}`),
				fetch(`/api/analytics/nutrients-daily?startDate=${startDate}&endDate=${endDate}`),
				fetch(`/api/sleep?from=${startDate}&to=${endDate}`)
			]);
			if (sfRes.ok) sleepFoodData = (await sfRes.json()).data ?? [];
			if (mRes.ok) mealEntries = (await mRes.json()).data ?? [];
			if (nRes.ok) nutrientSeries = (await nRes.json()).data ?? [];
			if (sleepRes.ok) {
				const all = (await sleepRes.json()).entries ?? [];
				sleepWithBedtime = all.filter((e: { bedtime: string | null }) => e.bedtime !== null);
			}
		} catch {
			// analytics cards will show no-data state
		} finally {
			analyticsLoading = false;
		}
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
		<FoodSleepCard {sleepFoodData} {mealEntries} loading={analyticsLoading} />
		<NutrientSleepCard {sleepFoodData} {nutrientSeries} loading={analyticsLoading} />
		<PreSleepWindowCard
			{sleepFoodData}
			{mealEntries}
			{sleepWithBedtime}
			loading={analyticsLoading}
		/>
		<CaffeineSleepCard />
	</div>
</div>
