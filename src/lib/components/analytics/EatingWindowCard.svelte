<script lang="ts">
	import { onMount } from 'svelte';
	import InsightCard from './InsightCard.svelte';
	import { extractMealTimingPatterns } from '$lib/analytics/meal-timing';
	import { getConfidenceLevel } from '$lib/analytics/correlation';
	import * as m from '$lib/paraglide/messages';
	import { today, shiftDate } from '$lib/utils/dates';

	type MealEntry = {
		date: string;
		mealType: string;
		eatenAt: string | null;
		calories: number;
		foodName: string;
	};

	let loading = $state(true);
	let error = $state<string | null>(null);
	let mealEntries = $state<MealEntry[]>([]);

	const analysis = $derived.by(() => {
		if (mealEntries.length === 0) return null;
		return extractMealTimingPatterns(mealEntries);
	});

	const avgWindowHours = $derived.by(() => {
		const a = analysis;
		if (!a) return 0;
		return Math.round((a.avgWindowMinutes / 60) * 10) / 10;
	});

	const firstMealHour = $derived.by(() => {
		const a = analysis;
		if (!a) return 8;
		return parseInt(a.avgFirstMealTime.split(':')[0]);
	});

	const lastMealHour = $derived.by(() => {
		const a = analysis;
		if (!a) return 20;
		return parseInt(a.avgLastMealTime.split(':')[0]);
	});

	const windowTrend = $derived.by(() => {
		const a = analysis;
		if (!a || a.dailyWindows.length < 7) return [];
		return a.dailyWindows.slice(-14).map((w) => ({
			date: w.date,
			hours: Math.round((w.windowMinutes / 60) * 10) / 10
		}));
	});

	const maxTrendHours = $derived.by(() => {
		const trend = windowTrend;
		if (trend.length === 0) return 16;
		return Math.max(...trend.map((d) => d.hours), avgWindowHours + 1);
	});

	const sampleSize = $derived.by(() => analysis?.dailyWindows.length ?? 0);
	const confidence = $derived.by(() => getConfidenceLevel(sampleSize));

	onMount(async () => {
		try {
			const endDate = today();
			const startDate = shiftDate(endDate, -29);
			const res = await fetch(
				`/api/analytics/meal-timing?startDate=${startDate}&endDate=${endDate}`
			);
			if (!res.ok) throw new Error('Failed to fetch');
			const json = await res.json();
			mealEntries = json.data ?? [];
		} catch {
			error = 'Failed to load data';
		} finally {
			loading = false;
		}
	});
</script>

{#if loading}
	<div class="rounded-lg border bg-card overflow-hidden">
		<div class="border-l-4 border-amber-500 p-4 sm:p-5">
			<div class="bg-muted/50 h-24 animate-pulse rounded-lg"></div>
		</div>
	</div>
{:else if error}
	<div class="rounded-lg border bg-card p-4 text-sm text-muted-foreground">{error}</div>
{:else}
	<InsightCard
		title={m.analytics_eating_window()}
		headline={m.analytics_eating_window_headline({ hours: avgWindowHours.toString() })}
		{confidence}
		{sampleSize}
		borderColor="border-amber-500"
	>
		{#snippet children()}
			{@const a = analysis}
			{#if a}
				{@const startPct = (firstMealHour / 24) * 100}
				{@const widthPct = ((lastMealHour - firstMealHour) / 24) * 100}
				<div class="space-y-3">
					<div class="space-y-1">
						<p class="text-xs text-muted-foreground">Average window (24h)</p>
						<div class="relative h-6 bg-muted/40 rounded overflow-hidden">
							<div
								class="absolute h-full rounded bg-amber-400/80 dark:bg-amber-600/60"
								style="left: {startPct}%; width: {Math.max(widthPct, 2)}%"
							></div>
						</div>
						<div class="flex justify-between text-[10px] text-muted-foreground tabular-nums">
							<span>0h</span>
							<span class="text-amber-600 dark:text-amber-400 font-medium">
								{a.avgFirstMealTime} – {a.avgLastMealTime}
							</span>
							<span>24h</span>
						</div>
					</div>

					{#if windowTrend.length > 0}
						<div class="space-y-1">
							<p class="text-xs text-muted-foreground">
								Window width trend (last {windowTrend.length} days)
							</p>
							<div class="flex items-end gap-0.5 h-10">
								{#each windowTrend as day (day.date)}
									{@const heightPct = maxTrendHours > 0 ? (day.hours / maxTrendHours) * 100 : 0}
									<div
										class="flex-1 bg-amber-400/60 dark:bg-amber-600/40 rounded-t"
										style="height: {heightPct}%"
										title="{day.date}: {day.hours}h"
									></div>
								{/each}
							</div>
						</div>
					{/if}

					<div class="text-xs text-muted-foreground">
						{#if a.lateNightFrequency > 20}
							Late night eating on {Math.round(a.lateNightFrequency)}% of days
						{/if}
					</div>
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">{m.insights_no_data()}</p>
			{/if}
		{/snippet}
	</InsightCard>
{/if}
