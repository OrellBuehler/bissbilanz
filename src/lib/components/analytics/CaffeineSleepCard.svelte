<script lang="ts">
	import { onMount } from 'svelte';
	import InsightCard from './InsightCard.svelte';
	import { computeCaffeineSleepCutoff } from '$lib/analytics/caffeine-sleep';
	import * as m from '$lib/paraglide/messages';
	import { today, shiftDate } from '$lib/utils/dates';

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

	let loading = $state(true);
	let caffeineEntries = $state<CaffeineEntry[]>([]);
	let sleepData = $state<SleepPoint[]>([]);

	onMount(async () => {
		const endDate = today();
		const startDate = shiftDate(endDate, -89);
		try {
			const [extRes, sfRes] = await Promise.all([
				fetch(`/api/analytics/nutrients-extended?startDate=${startDate}&endDate=${endDate}`),
				fetch(`/api/analytics/sleep-food?startDate=${startDate}&endDate=${endDate}`)
			]);
			if (extRes.ok) {
				const all = (await extRes.json()).data ?? [];
				caffeineEntries = all.filter((e: CaffeineEntry) => e.caffeine !== null && e.caffeine > 0);
			}
			if (sfRes.ok) {
				sleepData = (await sfRes.json()).data ?? [];
			}
		} catch {
			// card shows no-data state
		} finally {
			loading = false;
		}
	});

	const result = $derived.by(() => {
		if (caffeineEntries.length === 0 || sleepData.length === 0) return null;
		return computeCaffeineSleepCutoff(
			caffeineEntries.map((e) => ({
				date: e.date,
				eatenAt: e.eatenAt,
				caffeine: e.caffeine ?? 0
			})),
			sleepData
		);
	});

	const headline = $derived.by(() => {
		if (!result || result.estimatedCutoffHour === null) return m.analytics_caffeine_no_pattern();
		return m.analytics_caffeine_cutoff({ hour: result.estimatedCutoffHour.toString() });
	});

	const confidence = $derived(result?.confidence ?? 'insufficient');
	const sampleSize = $derived(result?.sampleSize ?? 0);
	const hourlyImpact = $derived(result?.hourlyImpact ?? []);

	const maxQuality = $derived(
		hourlyImpact.length > 0 ? Math.max(...hourlyImpact.map((h) => h.avgQuality)) : 5
	);
</script>

{#if loading}
	<div class="rounded-lg border bg-card overflow-hidden">
		<div class="border-l-4 border-amber-600 p-4 sm:p-5">
			<div class="bg-muted/50 h-24 animate-pulse rounded-lg"></div>
		</div>
	</div>
{:else}
	<InsightCard
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
						{m.analytics_correlation_disclaimer()}
					</p>
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">{m.insights_no_data()}</p>
			{/if}
		{/snippet}
	</InsightCard>
{/if}
