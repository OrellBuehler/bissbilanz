<script lang="ts">
	import { LineChart } from 'layerchart';
	import { ChartContainer, type ChartConfig } from '$lib/components/ui/chart/index.js';
	import { curveMonotoneX } from 'd3-shape';
	import ChartRangeSelector from '$lib/components/charts/ChartRangeSelector.svelte';
	import Weight from '@lucide/svelte/icons/weight';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import History from '@lucide/svelte/icons/history';
	import TrendingUp from '@lucide/svelte/icons/trending-up';
	import * as m from '$lib/paraglide/messages';

	type ChartPoint = {
		entry_date: string;
		weight_kg: number;
		moving_avg: number | null;
	};

	let {
		data,
		onRangeChange
	}: {
		data: ChartPoint[];
		onRangeChange: (start: string, end: string) => void;
	} = $props();

	const ranges = [
		{ key: '7d', label: () => m.weight_range_7d() },
		{ key: '30d', label: () => m.weight_range_30d() },
		{ key: '90d', label: () => m.weight_range_90d() },
		{ key: 'all', label: () => m.weight_range_all() }
	];

	type ProjectionRange = 0 | 14 | 30 | 60;
	let projectionDays: ProjectionRange = $state(0);

	function linearRegression(points: { x: number; y: number }[]) {
		const n = points.length;
		const sumX = points.reduce((s, p) => s + p.x, 0);
		const sumY = points.reduce((s, p) => s + p.y, 0);
		const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
		const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
		const denom = n * sumX2 - sumX * sumX;
		if (denom === 0) return { slope: 0, intercept: sumY / n };
		const slope = (n * sumXY - sumX * sumY) / denom;
		const intercept = (sumY - slope * sumX) / n;
		return { slope, intercept };
	}

	const canProject = $derived(data.length >= 3);
	const firstDateMs = $derived(data.length > 0 ? new Date(data[0].entry_date).getTime() : 0);

	const regression = $derived.by(() => {
		if (!canProject || projectionDays === 0) return null;
		const points = data.map((d) => ({
			x: (new Date(d.entry_date).getTime() - firstDateMs) / 86400000,
			y: Number(d.weight_kg)
		}));
		return linearRegression(points);
	});

	const shortLabels = $derived(data.length > 14);

	const chartData = $derived.by(() => {
		const actual = data.map((d) => {
			const dayIndex = (new Date(d.entry_date).getTime() - firstDateMs) / 86400000;
			return {
				weightKg: Number(d.weight_kg),
				movingAvg: d.moving_avg != null ? Number(d.moving_avg) : null,
				projection: regression
					? Number((regression.slope * dayIndex + regression.intercept).toFixed(1))
					: null,
				dateLabel: new Date(d.entry_date).toLocaleDateString(
					undefined,
					shortLabels ? { day: 'numeric', month: 'short' } : { weekday: 'short', day: 'numeric' }
				)
			};
		});

		if (!regression || projectionDays === 0 || data.length === 0) return actual;

		const lastDate = new Date(data[data.length - 1].entry_date);
		const lastDayIndex = (lastDate.getTime() - firstDateMs) / 86400000;

		const future = [];
		for (let i = 1; i <= projectionDays; i++) {
			const futureDate = new Date(lastDate);
			futureDate.setDate(futureDate.getDate() + i);
			const dayIndex = lastDayIndex + i;
			future.push({
				weightKg: null as number | null,
				movingAvg: null as number | null,
				projection: Number((regression.slope * dayIndex + regression.intercept).toFixed(1)),
				dateLabel: futureDate.toLocaleDateString(
					undefined,
					shortLabels ? { day: 'numeric', month: 'short' } : { weekday: 'short', day: 'numeric' }
				)
			});
		}

		return [...actual, ...future];
	});

	const tickStep = $derived(chartData.length > 14 ? Math.ceil(chartData.length / 7) : 1);
	const filteredTicks = $derived(
		chartData.filter((_, i) => i % tickStep === 0).map((d) => d.dateLabel)
	);

	const allValues = $derived.by(() => {
		const vals: number[] = [];
		for (const d of chartData) {
			if (d.weightKg != null) vals.push(d.weightKg);
			if (d.projection != null) vals.push(d.projection);
		}
		return vals;
	});
	const minWeight = $derived(allValues.length > 0 ? Math.min(...allValues) : 0);
	const maxWeight = $derived(allValues.length > 0 ? Math.max(...allValues) : 0);
	const padding = $derived((maxWeight - minWeight) * 0.15 || 2);
	const yDomain = $derived([Math.floor(minWeight - padding), Math.ceil(maxWeight + padding)]);

	const hasData = $derived(data.length > 0);
	const latestPoint = $derived(data.length > 0 ? data[data.length - 1] : null);
	const firstPoint = $derived(data.length > 0 ? data[0] : null);
	const latestWeight = $derived(latestPoint ? Number(latestPoint.weight_kg) : null);
	const latestMovingAvg = $derived(
		latestPoint?.moving_avg != null ? Number(latestPoint.moving_avg) : null
	);
	const rangeDelta = $derived(
		firstPoint && latestPoint ? Number(latestPoint.weight_kg) - Number(firstPoint.weight_kg) : null
	);
	const rangeDateLabel = $derived(
		firstPoint && latestPoint
			? `${new Date(firstPoint.entry_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} - ${new Date(latestPoint.entry_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
			: null
	);

	const projectedWeight = $derived.by(() => {
		if (projectionDays === 0 || chartData.length === 0) return null;
		const last = chartData[chartData.length - 1];
		return last.projection;
	});

	const formatWeight = (value: number | null) => (value == null ? '—' : `${value.toFixed(1)} kg`);
	const formatDelta = (value: number | null) => {
		if (value == null) return '—';
		const sign = value > 0 ? '+' : '';
		return `${sign}${value.toFixed(1)} kg`;
	};

	const config: ChartConfig = $derived({
		weightKg: { label: m.weight_actual(), color: '#2563EB' },
		movingAvg: { label: m.weight_trend(), color: '#059669' },
		...(projectionDays > 0
			? { projection: { label: m.weight_projection(), color: '#8B5CF6' } }
			: {})
	});

	const series = $derived([
		{ key: 'weightKg', label: m.weight_actual(), color: '#2563EB' },
		{ key: 'movingAvg', label: m.weight_trend(), color: '#059669' },
		...(projectionDays > 0
			? [
					{
						key: 'projection',
						label: m.weight_projection(),
						color: '#8B5CF6',
						props: { 'stroke-dasharray': '6 4' }
					}
				]
			: [])
	]);

	const projectionOptions: { days: ProjectionRange; label: () => string }[] = [
		{ days: 0, label: () => m.weight_projection_off() },
		{ days: 14, label: () => m.weight_projection_14d() },
		{ days: 30, label: () => m.weight_projection_30d() },
		{ days: 60, label: () => m.weight_projection_60d() }
	];
</script>

<div class="space-y-3">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div class="space-y-2">
			<div class="flex items-center gap-2">
				<div
					class="flex size-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400"
				>
					<Weight class="size-4" />
				</div>
				<div class="flex flex-1 items-center gap-2">
					<h2 class="text-lg font-semibold tracking-tight">{m.weight_chart()}</h2>
					{#if rangeDateLabel}
						<p class="ml-auto text-xs text-muted-foreground">{rangeDateLabel}</p>
					{/if}
				</div>
			</div>

			{#if hasData}
				<div class="flex flex-wrap items-center gap-1.5">
					<div
						class="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-2 py-1 text-[11px] font-medium text-muted-foreground"
					>
						<Weight class="size-3.5 text-blue-600 dark:text-blue-400" />
						<span>{m.weight_actual()}</span>
						<span class="font-semibold tabular-nums text-foreground"
							>{formatWeight(latestWeight)}</span
						>
					</div>
					<div
						class="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-2 py-1 text-[11px] font-medium text-muted-foreground"
					>
						<Sparkles class="size-3.5 text-emerald-600 dark:text-emerald-400" />
						<span>{m.weight_trend()}</span>
						<span class="font-semibold tabular-nums text-foreground"
							>{formatWeight(latestMovingAvg)}</span
						>
					</div>
					<div
						class="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-2 py-1 text-[11px] font-medium text-muted-foreground"
					>
						<History class="size-3.5" />
						<span>Δ</span>
						<span
							class={`font-semibold tabular-nums ${
								rangeDelta == null
									? 'text-foreground'
									: rangeDelta > 0
										? 'text-orange-600 dark:text-orange-400'
										: rangeDelta < 0
											? 'text-emerald-600 dark:text-emerald-400'
											: 'text-foreground'
							}`}
						>
							{formatDelta(rangeDelta)}
						</span>
					</div>
					{#if projectedWeight != null}
						<div
							class="inline-flex items-center gap-1.5 rounded-full border border-violet-300/60 bg-violet-50/80 px-2 py-1 text-[11px] font-medium text-muted-foreground dark:border-violet-700/60 dark:bg-violet-950/40"
						>
							<TrendingUp class="size-3.5 text-violet-600 dark:text-violet-400" />
							<span>{m.weight_projected()}</span>
							<span class="font-semibold tabular-nums text-violet-700 dark:text-violet-300"
								>{formatWeight(projectedWeight)}</span
							>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<ChartRangeSelector {ranges} activeRange="30d" {onRangeChange} />
	</div>

	{#if hasData}
		{#if canProject}
			<div class="flex items-center gap-2">
				<span class="text-xs font-medium text-muted-foreground">{m.weight_projection()}</span>
				<div class="bg-muted inline-flex rounded-full p-0.5">
					{#each projectionOptions as opt}
						<button
							type="button"
							class="rounded-full px-2.5 py-1 text-xs font-medium transition-all duration-200 {projectionDays ===
							opt.days
								? 'bg-background text-foreground shadow-sm'
								: 'text-muted-foreground hover:text-foreground'}"
							onclick={() => (projectionDays = opt.days)}
						>
							{opt.label()}
						</button>
					{/each}
				</div>
			</div>
		{/if}

		<div
			class="relative overflow-hidden rounded-xl border border-blue-200/60 bg-gradient-to-b from-blue-50/80 via-blue-50/20 to-background p-1 dark:border-blue-900/40 dark:from-blue-950/25 dark:via-blue-950/10"
		>
			<div class="absolute -top-8 right-8 h-20 w-20 rounded-full bg-blue-500/10 blur-2xl"></div>
			<div
				class="absolute -bottom-10 left-10 h-24 w-24 rounded-full bg-emerald-500/10 blur-2xl"
			></div>
			<div class="relative rounded-[0.8rem] border border-border/60 bg-background/80 p-2 sm:p-3">
				<div class="h-64 sm:h-[18.5rem]">
					<ChartContainer {config} class="h-full w-full">
						<LineChart
							data={chartData}
							x="dateLabel"
							{series}
							{yDomain}
							padding={{ left: 16, bottom: 4 }}
							tooltip={true}
							axis={true}
							grid={true}
							points={true}
							rule={false}
							props={{
								spline: { curve: curveMonotoneX },
								points: { r: 3 },
								grid: { y: { class: 'stroke-muted/30 [stroke-dasharray:3_6]' } },
								xAxis: {
									ticks: filteredTicks,
									tickLabelProps: { class: 'text-[11px] fill-muted-foreground/70 font-medium' }
								},
								yAxis: {
									format: (v: number) => `${v.toFixed(1)}`,
									ticks: 5,
									tickLabelProps: {
										class: 'text-[11px] fill-muted-foreground/70 font-medium tabular-nums'
									}
								},
								tooltip: {
									hideTotal: true,
									root: {
										variant: 'none',
										classes: {
											root: 'bg-background/95 text-foreground border border-border/60 rounded-xl shadow-xl shadow-black/5 text-xs px-3 py-2 backdrop-blur'
										}
									},
									header: { class: 'font-medium text-foreground' },
									item: {
										format: (v: number | null) => (v == null ? '—' : `${v.toFixed(1)} kg`),
										classes: {
											label: 'text-muted-foreground',
											value: 'text-foreground font-medium tabular-nums'
										}
									}
								}
							}}
						/>
					</ChartContainer>
				</div>
			</div>
		</div>
	{:else}
		<div
			class="flex h-64 items-center justify-center rounded-xl border border-dashed border-border/70 bg-gradient-to-b from-muted/20 to-background px-4 text-center text-sm text-muted-foreground"
		>
			<div class="flex items-center gap-2">
				<Weight class="size-4" />
				<span>{m.weight_no_entries()}</span>
			</div>
		</div>
	{/if}
</div>
