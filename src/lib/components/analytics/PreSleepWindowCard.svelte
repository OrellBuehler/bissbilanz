<script lang="ts">
	import { onMount } from 'svelte';
	import InsightCard from './InsightCard.svelte';
	import { pearsonCorrelation, getConfidenceLevel } from '$lib/analytics/correlation';
	import * as m from '$lib/paraglide/messages';
	import { today, shiftDate } from '$lib/utils/dates';
	import { db } from '$lib/db';
	import type { DexieSleepEntry } from '$lib/db/types';

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
		calories: number;
		foodName: string;
	};

	let loading = $state(true);
	let error = $state<string | null>(null);
	let sleepFoodData = $state<SleepFoodPoint[]>([]);
	let mealEntries = $state<MealEntry[]>([]);

	type SleepEntry = {
		date: string;
		bedtimeIso: string | null;
	};

	let sleepEntries = $state<SleepEntry[]>([]);

	let bedHour = $state(22);

	const analysis = $derived.by(() => {
		if (sleepFoodData.length === 0 || mealEntries.length === 0) return null;

		const lastMealByDate = new Map<string, number>();
		for (const entry of mealEntries) {
			if (!entry.eatenAt) continue;
			const hour = parseInt(entry.eatenAt.split('T')[1]?.split(':')[0] ?? '0', 10);
			if (hour >= 17) {
				const prev = lastMealByDate.get(entry.date) ?? 0;
				if (hour > prev) lastMealByDate.set(entry.date, hour);
			}
		}

		const pairs: { gapHours: number; quality: number }[] = [];
		for (const point of sleepFoodData) {
			if (point.sleepQuality === null) continue;
			const lastMealHour = lastMealByDate.get(point.date);
			if (lastMealHour === undefined) continue;
			const gap = Math.max(0, bedHour - lastMealHour);
			if (gap > 0) {
				pairs.push({ gapHours: gap, quality: point.sleepQuality });
			}
		}

		if (pairs.length < 3) return null;

		const corr = pearsonCorrelation(
			pairs.map((p) => p.gapHours),
			pairs.map((p) => p.quality)
		);

		const avgGap = pairs.reduce((s, p) => s + p.gapHours, 0) / pairs.length;

		return { corr, avgGap: Math.round(avgGap * 10) / 10, sampleSize: pairs.length };
	});

	const sampleSize = $derived.by(
		() => analysis?.sampleSize ?? sleepFoodData.filter((d) => d.sleepQuality !== null).length
	);
	const confidence = $derived.by(() => getConfidenceLevel(sampleSize));

	const bestGap = $derived.by(() => {
		const a = analysis;
		if (!a) return 2;
		return Math.round(a.avgGap + (a.corr.r > 0 ? 1 : 0));
	});

	onMount(async () => {
		try {
			const endDate = today();
			const startDate = shiftDate(endDate, -59);
			const [sfRes, mRes, sleepWithBedtime] = await Promise.all([
				fetch(`/api/analytics/sleep-food?startDate=${startDate}&endDate=${endDate}`),
				fetch(`/api/analytics/meal-timing?startDate=${startDate}&endDate=${endDate}`),
				db.sleepEntries.filter((e: DexieSleepEntry) => e.bedtime !== null).toArray()
			]);
			if (!sfRes.ok || !mRes.ok) throw new Error('Failed to fetch');
			const [sfJson, mJson] = await Promise.all([sfRes.json(), mRes.json()]);
			sleepFoodData = sfJson.data ?? [];
			mealEntries = mJson.data ?? [];
			// Use actual average bedtime from sleep entries; fall back to 22:00 if no data
			if (sleepWithBedtime.length > 0) {
				const avgBedHour =
					sleepWithBedtime.reduce((sum: number, e: DexieSleepEntry) => {
						const d = new Date(e.bedtime!);
						return sum + d.getHours() + d.getMinutes() / 60;
					}, 0) / sleepWithBedtime.length;
				bedHour = Math.round(avgBedHour);
			}
		} catch {
			error = 'Failed to load data';
		} finally {
			loading = false;
		}
	});
</script>

{#if loading}
	<div class="rounded-lg border bg-card overflow-hidden">
		<div class="border-l-4 border-purple-500 p-4 sm:p-5">
			<div class="bg-muted/50 h-16 animate-pulse rounded-lg"></div>
		</div>
	</div>
{:else if error}
	<div class="rounded-lg border bg-card p-4 text-sm text-muted-foreground">{error}</div>
{:else}
	<InsightCard
		title={m.analytics_presleep_window()}
		headline={m.analytics_presleep_headline({ hours: bestGap.toString() })}
		{confidence}
		{sampleSize}
		borderColor="border-purple-500"
	>
		{#snippet children()}
			{@const a = analysis}
			{#if a}
				<div class="space-y-2">
					<div class="rounded-lg bg-muted/30 p-3 text-xs space-y-1">
						<div class="flex justify-between">
							<span class="text-muted-foreground">{m.analytics_presleep_avg_gap()}</span>
							<span class="font-semibold tabular-nums">{a.avgGap}h</span>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">{m.analytics_presleep_correlation()}</span>
							<span
								class="font-semibold tabular-nums {a.corr.r > 0
									? 'text-green-600 dark:text-green-400'
									: 'text-red-600 dark:text-red-400'}"
							>
								r = {a.corr.r > 0 ? '+' : ''}{a.corr.r.toFixed(2)}
							</span>
						</div>
					</div>
					<p class="text-[11px] text-muted-foreground">{m.analytics_correlation_disclaimer()}</p>
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">{m.insights_no_data()}</p>
			{/if}
		{/snippet}
	</InsightCard>
{/if}
