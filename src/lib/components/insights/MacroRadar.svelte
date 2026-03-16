<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { MACRO_COLORS } from '$lib/colors';
	import { today, shiftDate } from '$lib/utils/dates';
	import { statsService } from '$lib/services/stats-service.svelte';
	import * as m from '$lib/paraglide/messages';

	type MacroKey = 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber';
	type DayRow = {
		date: string;
		calories: number;
		protein: number;
		carbs: number;
		fat: number;
		fiber: number;
	};
	type Goals = {
		calorieGoal: number;
		proteinGoal: number;
		carbGoal: number;
		fatGoal: number;
		fiberGoal: number;
	} | null;

	type RangeKey = '7d' | '30d' | '90d';
	let range: RangeKey = $state('7d');
	let data: DayRow[] = $state([]);
	let goals = $state<Goals>(null);
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
		{ key: 'fat', label: () => m.macro_fat(), goalKey: 'fatGoal', color: MACRO_COLORS.fat },
		{ key: 'fiber', label: () => m.macro_fiber(), goalKey: 'fiberGoal', color: MACRO_COLORS.fiber }
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

	const daysWithEntries = $derived(data.filter((d) => d.calories > 0));

	const averages = $derived.by(() => {
		if (daysWithEntries.length === 0) {
			return { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
		}
		const n = daysWithEntries.length;
		return {
			calories: Math.round(daysWithEntries.reduce((s, d) => s + d.calories, 0) / n),
			protein: Math.round(daysWithEntries.reduce((s, d) => s + d.protein, 0) / n),
			carbs: Math.round(daysWithEntries.reduce((s, d) => s + d.carbs, 0) / n),
			fat: Math.round(daysWithEntries.reduce((s, d) => s + d.fat, 0) / n),
			fiber: Math.round(daysWithEntries.reduce((s, d) => s + d.fiber, 0) / n)
		};
	});

	const percentages = $derived.by(() => {
		if (!goals) return axes.map(() => 0);
		return axes.map((a) => {
			const goalVal = goals![a.goalKey];
			if (!goalVal) return 0;
			return Math.min((averages[a.key] / goalVal) * 100, 150);
		});
	});

	const cx = 150;
	const cy = 155;
	const radius = 100;
	const n = 5;

	function polarToCart(angleDeg: number, r: number): { x: number; y: number } {
		const rad = ((angleDeg - 90) * Math.PI) / 180;
		return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
	}

	const angleStep = 360 / n;

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
						stroke="hsl(var(--muted-foreground) / 0.15)"
						stroke-width="1"
					/>
				{/each}

				{#each axes as _, i}
					{@const end = polarToCart(i * angleStep, radius)}
					<line
						x1={cx}
						y1={cy}
						x2={end.x}
						y2={end.y}
						stroke="hsl(var(--muted-foreground) / 0.15)"
						stroke-width="1"
					/>
				{/each}

				<polygon
					points={goalPolygon}
					fill="none"
					stroke="hsl(var(--muted-foreground) / 0.5)"
					stroke-width="1.5"
					stroke-dasharray="4 3"
				/>

				<polygon
					points={polygonPoints(percentages)}
					fill="hsl(var(--primary) / 0.15)"
					stroke="hsl(var(--primary))"
					stroke-width="2"
				/>

				{#each axes as axis, i}
					{@const pt = polarToCart(i * angleStep, radius + 18)}
					<text
						x={pt.x}
						y={pt.y}
						text-anchor="middle"
						dominant-baseline="middle"
						class="fill-muted-foreground text-[11px] font-medium"
						style="fill: {axis.color}"
					>
						{axis.label()}
					</text>
				{/each}
			</svg>
		</div>

		<div class="grid grid-cols-2 gap-2 sm:grid-cols-5">
			{#each axes as axis (axis.key)}
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
