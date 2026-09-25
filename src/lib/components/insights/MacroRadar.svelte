<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import MacroSourcesModal from './MacroSourcesModal.svelte';
	import { MACRO_COLORS } from '$lib/colors';
	import { today, shiftDate } from '$lib/utils/dates';
	import { statsService } from '$lib/services/stats-service.svelte';
	import {
		radarAverages,
		radarPercentages,
		type DayRow,
		type Goals,
		type MacroKey
	} from '$lib/utils/insights';
	import * as Sentry from '@sentry/sveltekit';
	import * as m from '$lib/paraglide/messages';

	let { initialData }: { initialData?: { data: DayRow[]; goals: Goals | null } } = $props();

	type RangeKey = '7d' | '30d' | '90d';
	let range: RangeKey = $state('7d');
	let data: DayRow[] = $state(initialData?.data ?? []);
	let goals = $state<Goals | null>(initialData?.goals ?? null);
	let loading = $state(!initialData);
	let refreshing = $state(false);

	const rangeDays: Record<RangeKey, number> = { '7d': 6, '30d': 29, '90d': 89 };
	const rangeLabels: Record<RangeKey, () => string> = {
		'7d': () => m.insights_7d(),
		'30d': () => m.insights_30d(),
		'90d': () => m.insights_90d()
	};

	type Axis = {
		key: Exclude<MacroKey, 'calories'>;
		label: () => string;
		goalKey: keyof NonNullable<Goals>;
		color: string;
	};

	let sourcesAxis = $state<Axis | null>(null);
	let sourcesOpen = $state(false);

	const axes: Axis[] = [
		{
			key: 'protein',
			label: () => m.macro_protein(),
			goalKey: 'proteinGoal',
			color: MACRO_COLORS.protein
		},
		{ key: 'carbs', label: () => m.macro_carbs(), goalKey: 'carbGoal', color: MACRO_COLORS.carbs },
		{ key: 'fat', label: () => m.macro_fat(), goalKey: 'fatGoal', color: MACRO_COLORS.fat },
		{
			key: 'fiber',
			label: () => m.macro_fiber(),
			goalKey: 'fiberGoal',
			color: MACRO_COLORS.fiber
		}
	];

	const fetchData = async (r: RangeKey) => {
		refreshing = true;
		try {
			const end = today();
			const start = shiftDate(end, -rangeDays[r]);
			const result = await statsService.getDailyStatus(start, end);
			if (result) {
				data = result.data;
				goals = result.goals;
			}
		} catch (err) {
			Sentry.captureException(err, { extra: { range: r } });
			data = [];
		} finally {
			loading = false;
			refreshing = false;
		}
	};

	let initialized = !!initialData;
	$effect(() => {
		const r = range;
		if (initialized && r === '7d') {
			initialized = false;
			return;
		}
		initialized = false;
		fetchData(r);
	});

	const averages = $derived(radarAverages(data));

	const percentages = $derived(radarPercentages(averages, goals));

	const cx = 190;
	const cy = 160;
	const radius = 100;
	const labelRadius = radius + 18;
	const n = 4;

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
		<div class="flex justify-center transition-opacity" class:opacity-60={refreshing}>
			<svg viewBox="0 0 380 320" class="h-auto w-full max-w-[380px]">
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

				{#each axes as axis, i}
					{@const pct = percentages[i]}
					{@const pt = polarToCart(i * angleStep, (pct / 100) * radius)}
					<circle cx={pt.x} cy={pt.y} r="4" fill={axis.color} opacity="0.85" />
				{/each}

				{#each axes as axis, i}
					{@const pt = polarToCart(i * angleStep, labelRadius)}
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
			</svg>
		</div>

		<div
			class="grid grid-cols-2 gap-2 sm:grid-cols-4 transition-opacity"
			class:opacity-60={refreshing}
		>
			{#each axes as axis (axis.key)}
				{@const goalVal = goals[axis.goalKey]}
				<!-- The radar says how far off a macro is, not why: each tile lists
				     the foods that contributed the most of it. -->
				<Button
					variant="outline"
					class="h-auto flex-col gap-0 p-2 font-normal"
					aria-label={m.insights_macro_sources_open({ macro: axis.label() })}
					onclick={() => {
						sourcesAxis = axis;
						sourcesOpen = true;
					}}
				>
					<div class="flex items-center gap-0.5 text-xs font-medium" style="color: {axis.color}">
						{axis.label()}
						<ChevronRight class="size-3.5" />
					</div>
					<div class="mt-0.5 text-sm font-bold tabular-nums">{averages[axis.key]}g</div>
					<div class="text-muted-foreground text-xs tabular-nums">
						{m.insights_goal()}: {goalVal}g
					</div>
				</Button>
			{/each}
		</div>
	{/if}
</div>

{#if sourcesAxis}
	<MacroSourcesModal
		bind:open={sourcesOpen}
		macro={sourcesAxis.key}
		label={sourcesAxis.label()}
		color={sourcesAxis.color}
		days={rangeDays[range] + 1}
		rows={data}
	/>
{/if}
