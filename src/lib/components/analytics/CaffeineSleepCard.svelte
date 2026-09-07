<script lang="ts">
	import InsightCard from './InsightCard.svelte';
	import { computeCaffeineSleepCutoff } from '$lib/analytics/caffeine-sleep';
	import { deviceTimeZone } from '$lib/analytics/local-time';
	import { DEFAULT_CAFFEINE_CUTOFF_HOUR } from '$lib/analytics/constants.generated';
	import * as m from '$lib/paraglide/messages';

	type CaffeineEntry = {
		date: string;
		eatenAt: string | null;
		caffeine: number | null;
	};

	type SleepPoint = {
		date: string;
		sleepQuality: number | null;
		sleepDurationMinutes: number | null;
	};

	let {
		nutrientEntries = [],
		sleepFoodData = [],
		loading = false
	}: {
		nutrientEntries: CaffeineEntry[];
		sleepFoodData: SleepPoint[];
		loading?: boolean;
	} = $props();

	const caffeineEntries = $derived(
		nutrientEntries.filter((e) => e.caffeine !== null && e.caffeine > 0)
	);
	const sleepData = $derived(sleepFoodData);

	const result = $derived.by(() => {
		if (caffeineEntries.length === 0 || sleepData.length === 0) return null;
		return computeCaffeineSleepCutoff(
			caffeineEntries.map((e) => ({
				date: e.date,
				eatenAt: e.eatenAt,
				caffeine: e.caffeine ?? 0
			})),
			sleepData,
			deviceTimeZone()
		);
	});

	const headline = $derived.by(() => {
		if (!result || result.estimatedCutoffHour === null) {
			return m.analytics_caffeine_no_pattern({
				hour: (result?.defaultCutoffHour ?? DEFAULT_CAFFEINE_CUTOFF_HOUR).toString()
			});
		}
		return m.analytics_caffeine_cutoff({ hour: result.estimatedCutoffHour.toString() });
	});

	const confidence = $derived(result?.confidence ?? 'insufficient');
	const sampleSize = $derived(result?.sampleSize ?? 0);
	const hourlyImpact = $derived(result?.hourlyImpact ?? []);

	const maxQuality = $derived(
		hourlyImpact.length > 0 ? Math.max(...hourlyImpact.map((h) => h.avgQuality)) : 5
	);
</script>

<InsightCard
	{loading}
	title={m.analytics_caffeine_sleep()}
	{headline}
	{confidence}
	{sampleSize}
	borderColor="border-amber-600"
>
	{#snippet children()}
		{#if hourlyImpact.length > 0}
			<div class="space-y-1.5">
				<p class="text-[11px] font-medium text-muted-foreground mb-2">
					{m.analytics_caffeine_quality()}
				</p>
				{#each hourlyImpact as bucket (bucket.hour)}
					{@const pct = maxQuality > 0 ? (bucket.avgQuality / maxQuality) * 100 : 0}
					{@const isAfterCutoff =
						result?.estimatedCutoffHour !== null &&
						result?.estimatedCutoffHour !== undefined &&
						bucket.hour >= result.estimatedCutoffHour}
					<div class="flex items-center gap-2">
						<span class="w-10 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
							{m.analytics_caffeine_hour({ hour: bucket.hour.toString() })}
						</span>
						<div class="flex-1 rounded-full bg-muted h-2 overflow-hidden">
							<div
								class="h-2 rounded-full transition-all {isAfterCutoff
									? 'bg-amber-500'
									: 'bg-green-500'}"
								style="width: {pct}%"
							></div>
						</div>
						<span class="w-8 shrink-0 text-[11px] tabular-nums text-muted-foreground">
							{bucket.avgQuality.toFixed(1)}
						</span>
					</div>
				{/each}
				<p class="text-[11px] text-muted-foreground mt-2">
					{#if result && result.pValue !== null}
						{m.analytics_caffeine_tested({
							n: result.comparisons.toString(),
							p: result.pValue.toFixed(3)
						})} ·
					{/if}
					{m.analytics_caffeine_evidence()}
				</p>
				<p class="text-[11px] text-muted-foreground">
					{m.analytics_correlation_disclaimer()}
				</p>
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">{m.insights_no_data()}</p>
		{/if}
	{/snippet}
</InsightCard>
