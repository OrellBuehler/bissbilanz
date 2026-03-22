<script lang="ts">
	import { onMount } from 'svelte';
	import InsightCard from './InsightCard.svelte';
	import { pearsonCorrelation, getConfidenceLevel } from '$lib/analytics/correlation';
	import * as m from '$lib/paraglide/messages';
	import { today, shiftDate } from '$lib/utils/dates';
	import { MACRO_COLORS } from '$lib/colors';

	type WeightFoodPoint = {
		date: string;
		calories: number | null;
		weightKg: number | null;
		movingAvg: number | null;
	};

	type DailyNutrient = {
		date: string;
		calories: number;
		protein: number;
		carbs: number;
		fat: number;
		fiber: number;
	};

	let loading = $state(true);
	let error = $state<string | null>(null);
	let weightSeries = $state<WeightFoodPoint[]>([]);
	let nutrientSeries = $state<DailyNutrient[]>([]);

	type MacroCorrelation = {
		key: keyof typeof MACRO_COLORS;
		label: string;
		r: number;
		color: string;
	};

	const macroCorrelations = $derived((): MacroCorrelation[] => {
		if (weightSeries.length === 0 || nutrientSeries.length === 0) return [];

		const weightByDate = new Map(
			weightSeries.filter((d) => d.weightKg !== null).map((d) => [d.date, d.weightKg as number])
		);
		const nutrientByDate = new Map(nutrientSeries.map((d) => [d.date, d]));

		const dates = [...weightByDate.keys()].sort();
		if (dates.length < 3) return [];

		const weightChanges: { date: string; change: number }[] = [];
		for (let i = 1; i < dates.length; i++) {
			const prev = weightByDate.get(dates[i - 1]);
			const curr = weightByDate.get(dates[i]);
			if (prev !== undefined && curr !== undefined) {
				weightChanges.push({ date: dates[i], change: curr - prev });
			}
		}

		if (weightChanges.length < 3) return [];

		const macros: { key: keyof typeof MACRO_COLORS; label: string; color: string }[] = [
			{ key: 'protein', label: m.macro_protein(), color: MACRO_COLORS.protein },
			{ key: 'carbs', label: m.macro_carbs(), color: MACRO_COLORS.carbs },
			{ key: 'fat', label: m.macro_fat(), color: MACRO_COLORS.fat },
			{ key: 'fiber', label: m.macro_fiber(), color: MACRO_COLORS.fiber }
		];

		return macros
			.map(({ key, label, color }) => {
				const pairs = weightChanges
					.map((wc) => {
						const nutrient = nutrientByDate.get(wc.date);
						if (!nutrient) return null;
						return { x: nutrient[key as 'protein' | 'carbs' | 'fat' | 'fiber'], y: wc.change };
					})
					.filter((p): p is { x: number; y: number } => p !== null);

				if (pairs.length < 3) return { key, label, r: 0, color };

				const result = pearsonCorrelation(
					pairs.map((p) => p.x),
					pairs.map((p) => p.y)
				);
				return { key, label, r: result.r, color };
			})
			.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
	});

	const sampleSize = $derived(() => {
		const wt = weightSeries.filter((d) => d.weightKg !== null).length;
		const nt = nutrientSeries.length;
		return Math.min(wt, nt);
	});

	const confidence = $derived(() => getConfidenceLevel(sampleSize()));

	onMount(async () => {
		try {
			const endDate = today();
			const startDate = shiftDate(endDate, -29);
			const [wRes, nRes] = await Promise.all([
				fetch(`/api/analytics/weight-food?startDate=${startDate}&endDate=${endDate}`),
				fetch(`/api/analytics/nutrients-daily?startDate=${startDate}&endDate=${endDate}`)
			]);
			if (!wRes.ok || !nRes.ok) throw new Error('Failed to fetch');
			const [wJson, nJson] = await Promise.all([wRes.json(), nRes.json()]);
			weightSeries = wJson.data ?? [];
			nutrientSeries = nJson.data ?? [];
		} catch {
			error = 'Failed to load data';
		} finally {
			loading = false;
		}
	});
</script>

{#if loading}
	<div class="rounded-lg border bg-card overflow-hidden">
		<div class="border-l-4 border-blue-500 p-4 sm:p-5">
			<div class="bg-muted/50 h-24 animate-pulse rounded-lg"></div>
		</div>
	</div>
{:else if error}
	<div class="rounded-lg border bg-card p-4 text-sm text-muted-foreground">{error}</div>
{:else}
	<InsightCard
		title={m.analytics_macro_impact()}
		headline={m.analytics_macro_impact_headline()}
		confidence={confidence()}
		sampleSize={sampleSize()}
		borderColor="border-blue-500"
	>
		{#snippet children()}
			{@const correlations = macroCorrelations()}
			{#if correlations.length > 0}
				<div class="space-y-2">
					{#each correlations as macro (macro.key)}
						{@const absR = Math.abs(macro.r)}
						{@const barPct = absR * 100}
						{@const isPositive = macro.r >= 0}
						<div class="flex items-center gap-3">
							<span class="w-14 shrink-0 text-xs font-medium" style="color: {macro.color}">
								{macro.label}
							</span>
							<div class="relative flex-1 h-5 bg-muted/40 rounded overflow-hidden">
								<div
									class="h-full rounded transition-all"
									style="width: {barPct}%; background-color: {macro.color}; opacity: 0.7"
								></div>
							</div>
							<span
								class="w-12 shrink-0 text-right text-xs tabular-nums font-medium {isPositive
									? 'text-red-600 dark:text-red-400'
									: 'text-green-600 dark:text-green-400'}"
							>
								{macro.r > 0 ? '+' : ''}{macro.r.toFixed(2)}
							</span>
						</div>
					{/each}
					<p class="text-[11px] text-muted-foreground pt-1">
						{m.analytics_correlation_disclaimer()}
					</p>
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">{m.insights_no_data()}</p>
			{/if}
		{/snippet}
	</InsightCard>
{/if}
