<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { MACRO_COLORS } from '$lib/colors';
	import { today, shiftDate } from '$lib/utils/dates';
	import { statsService } from '$lib/services/stats-service.svelte';
	import { radarAverages, type DayRow, type Goals, type MacroKey } from '$lib/utils/insights';
	import * as m from '$lib/paraglide/messages';

	type RangeKey = '7d' | '30d' | '90d';
	let range: RangeKey = $state('7d');
	let data: DayRow[] = $state([]);
	let goals = $state<Goals | null>(null);
	let loading = $state(true);

	const rangeDays: Record<RangeKey, number> = { '7d': 6, '30d': 29, '90d': 89 };
	const rangeLabels: Record<RangeKey, () => string> = {
		'7d': () => m.insights_7d(),
		'30d': () => m.insights_30d(),
		'90d': () => m.insights_90d()
	};

	const axes: {
		key: MacroKey;
		label: () => string;
		goalKey: keyof NonNullable<Goals>;
		color: string;
	}[] = [
		{
			key: 'calories',
			label: () => m.macro_calories(),
			goalKey: 'calorieGoal',
			color: MACRO_COLORS.calories
		},
		{
			key: 'protein',
			label: () => m.macro_protein(),
			goalKey: 'proteinGoal',
			color: MACRO_COLORS.protein
		},
		{ key: 'carbs', label: () => m.macro_carbs(), goalKey: 'carbGoal', color: MACRO_COLORS.carbs },
		{ key: 'fat', label: () => m.macro_fat(), goalKey: 'fatGoal', color: MACRO_COLORS.fat }
	];

	const allAxes = [
		...axes,
		{
			key: 'fiber' as MacroKey,
			label: () => m.macro_fiber(),
			goalKey: 'fiberGoal' as keyof NonNullable<Goals>,
			color: MACRO_COLORS.fiber
		}
	];

	const fetchData = async (r: RangeKey) => {
		loading = true;
		try {
			const end = today();
			const start = shiftDate(end, -rangeDays[r]);
			const result = await statsService.getDailyStatus(start, end);
			if (result) {
				data = result.data;
				goals = result.goals;
			}
		} catch {
			data = [];
		} finally {
			loading = false;
		}
	};

	$effect(() => {
		fetchData(range);
	});

	const averages = $derived(radarAverages(data));

	const percentages = $derived.by(() => {
		const g = goals;
		if (!g) return axes.map(() => 0);
		return axes.map((a) => {
			const goalVal = g[a.goalKey];
			if (!goalVal) return 0;
			return Math.min((averages[a.key] / goalVal) * 100, 150);
		});
	});

	const fiberPercentage = $derived.by(() => {
		if (!goals || !goals.fiberGoal) return 0;
		return Math.min((averages.fiber / goals.fiberGoal) * 100, 150);
	});

	const cx = 150;
	const cy = 155;
	const radius = 100;
	const n = 4;

	function polarToCart(angleDeg: number, r: number): { x: number; y: number } {
		const rad = ((angleDeg - 90) * Math.PI) / 180;
		return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
	}

	const angleStep = 360 / n;
	const carbsAxisIndex = 2;
	const fiberPt = $derived(
		polarToCart(carbsAxisIndex * angleStep, (fiberPercentage / 100) * radius)
	);
	const fiberLabelPt = $derived(
		polarToCart(carbsAxisIndex * angleStep, Math.max((fiberPercentage / 100) * radius - 14, 0))
	);

	function polygonPoints(values: number[]): string {
		return values
			.map((v, i) => {
				const r = (v / 100) * radius;
				const { x, y } = polarToCart(i * angleStep, r);
				return `${x},${y}`;
			})
			.join(' ');
	}

	const goalPolygon = $derived(polygonPoints(axes.map(() => 100)));

	const gridLevels = [25, 50, 75, 100];
</script>

<div class="space-y-3">
	<div class="flex items-center justify-end">
		<div class="flex gap-1">
			{#each ['7d', '30d', '90d'] as const as r (r)}
				<Button variant={range === r ? 'default' : 'outline'} size="sm" onclick={() => (range = r)}>
					{rangeLabels[r]()}
				</Button>
			{/each}
		</div>
	</div>

	{#if loading}
		<div class="text-muted-foreground flex h-[300px] items-center justify-center text-sm">
			{m.add_food_loading()}
		</div>
	{:else if !goals}
		<div class="text-muted-foreground flex h-[300px] items-center justify-center text-sm">
			{m.insights_no_goals()}
		</div>
	{:else}
		<div class="flex justify-center">
			<svg viewBox="0 0 300 320" class="h-[260px] w-[260px] sm:h-[300px] sm:w-[300px]">
				{#each gridLevels as level}
					<polygon
						points={polygonPoints(axes.map(() => level))}
						fill="none"
						stroke="#d1d5db"
						stroke-width="0.75"
						opacity="0.5"
					/>
				{/each}

				{#each axes as _, i}
					{@const end = polarToCart(i * angleStep, radius)}
					<line
						x1={cx}
						y1={cy}
						x2={end.x}
						y2={end.y}
						stroke="#d1d5db"
						stroke-width="0.75"
						opacity="0.5"
					/>
				{/each}

				<polygon
					points={goalPolygon}
					fill="none"
					stroke="#9ca3af"
					stroke-width="1.5"
					stroke-dasharray="4 3"
				/>

				<polygon
					points={polygonPoints(percentages)}
					fill="#e5e7eb"
					fill-opacity="0.4"
					stroke="#9ca3af"
					stroke-width="1.5"
				/>

				<line
					x1={cx}
					y1={cy}
					x2={fiberPt.x}
					y2={fiberPt.y}
					stroke={MACRO_COLORS.fiber}
					stroke-width="2"
					opacity="0.6"
				/>
				<circle cx={fiberPt.x} cy={fiberPt.y} r="4" fill={MACRO_COLORS.fiber} opacity="0.85" />

				{#each axes as axis, i}
					{@const pct = percentages[i]}
					{@const pt = polarToCart(i * angleStep, (pct / 100) * radius)}
					<circle cx={pt.x} cy={pt.y} r="4" fill={axis.color} opacity="0.85" />
				{/each}

				{#each axes as axis, i}
					{@const labelR = Math.max((percentages[i] / 100) * radius, radius) + 20}
					{@const pt = polarToCart(i * angleStep, labelR)}
					<text
						x={pt.x}
						y={pt.y}
						text-anchor="middle"
						dominant-baseline="middle"
						class="text-[13px] font-bold"
						style="fill: {axis.color}"
					>
						{axis.label()}
					</text>
				{/each}

				<text
					x={fiberLabelPt.x}
					y={fiberLabelPt.y}
					text-anchor="middle"
					dominant-baseline="middle"
					class="text-[11px] font-semibold"
					style="fill: {MACRO_COLORS.fiber}"
				>
					{m.macro_fiber()}
				</text>
			</svg>
		</div>

		<div class="grid grid-cols-2 gap-2 sm:grid-cols-5">
			{#each allAxes as axis (axis.key)}
				{@const avg = averages}
				{@const goalVal = goals[axis.goalKey]}
				<div class="rounded-lg border p-2 text-center">
					<div class="text-xs font-medium" style="color: {axis.color}">{axis.label()}</div>
					<div class="mt-0.5 text-sm font-bold tabular-nums">
						{avg[axis.key]}{axis.key === 'calories' ? '' : 'g'}
					</div>
					<div class="text-muted-foreground text-xs tabular-nums">
						{m.insights_goal()}: {goalVal}{axis.key === 'calories' ? '' : 'g'}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
