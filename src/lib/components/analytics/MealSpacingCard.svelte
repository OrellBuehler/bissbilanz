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

	const analysis = $derived(() => {
		if (mealEntries.length === 0) return null;
		return extractMealTimingPatterns(mealEntries);
	});

	const hourlyData = $derived(() => {
		const a = analysis();
		if (!a) return [];
		const max = Math.max(...a.hourlyDistribution, 1);
		return a.hourlyDistribution.map((count, hour) => ({
			hour,
			count,
			pct: (count / max) * 100,
			isPeak: count >= max * 0.7
		}));
	});

	const peakHours = $derived(() =>
		hourlyData()
			.filter((h) => h.isPeak && h.count > 0)
			.map((h) => {
				const period = h.hour < 12 ? 'AM' : 'PM';
				const displayHour = h.hour === 0 ? 12 : h.hour > 12 ? h.hour - 12 : h.hour;
				return `${displayHour}${period}`;
			})
	);

	const sampleSize = $derived(() => analysis()?.dailyWindows.length ?? 0);
	const confidence = $derived(() => getConfidenceLevel(sampleSize()));

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
		title={m.analytics_meal_spacing()}
		headline={m.analytics_meal_spacing_headline()}
		confidence={confidence()}
		sampleSize={sampleSize()}
		borderColor="border-amber-500"
	>
		{#snippet children()}
			{@const hours = hourlyData()}
			{#if hours.some((h) => h.count > 0)}
				<div class="space-y-2">
					<div class="space-y-0.5">
						{#each hours.filter((h) => h.count > 0) as h (h.hour)}
							{@const displayHour =
								h.hour === 0
									? '12 AM'
									: h.hour < 12
										? `${h.hour} AM`
										: h.hour === 12
											? '12 PM'
											: `${h.hour - 12} PM`}
							<div class="flex items-center gap-2">
								<span class="w-10 shrink-0 text-[10px] tabular-nums text-muted-foreground">
									{displayHour}
								</span>
								<div class="relative flex-1 h-4 bg-muted/40 rounded overflow-hidden">
									<div
										class="h-full rounded transition-all {h.isPeak
											? 'bg-amber-500'
											: 'bg-amber-300/60 dark:bg-amber-700/40'}"
										style="width: {h.pct}%"
									></div>
								</div>
								<span
									class="w-6 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground"
								>
									{h.count}
								</span>
							</div>
						{/each}
					</div>
					{#if peakHours().length > 0}
						<p class="text-xs text-muted-foreground">
							Peak times: <span class="font-medium text-foreground">{peakHours().join(', ')}</span>
						</p>
					{/if}
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">{m.insights_no_data()}</p>
			{/if}
		{/snippet}
	</InsightCard>
{/if}
