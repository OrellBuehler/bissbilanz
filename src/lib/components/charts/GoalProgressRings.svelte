<script lang="ts">
	import type { MacroTotals } from '$lib/utils/nutrition';
	import * as m from '$lib/paraglide/messages';

	type Goals = {
		calorieGoal: number;
		proteinGoal: number;
		carbGoal: number;
		fatGoal: number;
		fiberGoal: number;
	};

	let { totals, goals }: { totals: MacroTotals; goals: Goals | null } = $props();

	const rings = $derived(
		goals
			? [
					{
						label: m.macro_calories(),
						consumed: Math.round(totals.calories),
						goal: goals.calorieGoal,
						color: '#3B82F6',
						bg: '#3B82F620',
						unit: 'kcal'
					},
					{
						label: m.macro_protein(),
						consumed: Math.round(totals.protein * 10) / 10,
						goal: goals.proteinGoal,
						color: '#EF4444',
						bg: '#EF444420',
						unit: 'g'
					},
					{
						label: m.macro_carbs(),
						consumed: Math.round(totals.carbs * 10) / 10,
						goal: goals.carbGoal,
						color: '#F97316',
						bg: '#F9731620',
						unit: 'g'
					},
					{
						label: m.macro_fat(),
						consumed: Math.round(totals.fat * 10) / 10,
						goal: goals.fatGoal,
						color: '#EAB308',
						bg: '#EAB30820',
						unit: 'g'
					},
					{
						label: m.macro_fiber(),
						consumed: Math.round(totals.fiber * 10) / 10,
						goal: goals.fiberGoal,
						color: '#22C55E',
						bg: '#22C55E20',
						unit: 'g'
					}
				]
			: []
	);

	const size = 220;
	const mobileSize = 180;
	const strokeWidth = 14;
	const gap = 4;
	const center = size / 2;

	function ringRadius(index: number) {
		return center - strokeWidth / 2 - index * (strokeWidth + gap);
	}

	function circumference(radius: number) {
		return 2 * Math.PI * radius;
	}

	function dashOffset(radius: number, fraction: number) {
		const c = circumference(radius);
		const clamped = Math.min(fraction, 1);
		return c * (1 - clamped);
	}
</script>

<div class="flex flex-col items-center gap-3">
	<svg
		viewBox="0 0 {size} {size}"
		class="h-[180px] w-[180px] sm:h-[220px] sm:w-[220px] -rotate-90"
	>
		{#each rings as ring, i}
			{@const r = ringRadius(i)}
			{@const c = circumference(r)}
			{@const fraction = ring.goal > 0 ? ring.consumed / ring.goal : 0}
			{@const isOver = fraction > 1}
			<circle
				cx={center}
				cy={center}
				{r}
				fill="none"
				stroke={ring.bg}
				stroke-width={strokeWidth}
				stroke-linecap="round"
			/>
			<circle
				cx={center}
				cy={center}
				{r}
				fill="none"
				stroke={ring.color}
				stroke-width={strokeWidth}
				stroke-linecap="round"
				stroke-dasharray={c}
				stroke-dashoffset={dashOffset(r, fraction)}
				class="ring-progress"
				opacity={isOver ? 0.85 : 1}
				filter={isOver ? 'url(#glow)' : undefined}
			/>
		{/each}
		<defs>
			<filter id="glow">
				<feGaussianBlur stdDeviation="2" result="blur" />
				<feMerge>
					<feMergeNode in="blur" />
					<feMergeNode in="SourceGraphic" />
				</feMerge>
			</filter>
		</defs>
	</svg>

	<div class="text-center -mt-[120px] sm:-mt-[148px] mb-[56px] sm:mb-[68px]">
		<span class="text-2xl font-bold tabular-nums text-foreground">{Math.round(totals.calories)}</span>
		<span class="block text-xs text-muted-foreground">kcal</span>
	</div>

	<div class="flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-xs">
		{#each rings as ring}
			{@const pct = ring.goal > 0 ? Math.round((ring.consumed / ring.goal) * 100) : 0}
			{@const isOver = ring.consumed > ring.goal && ring.goal > 0}
			<div class="flex items-center gap-1.5">
				<span class="inline-block h-2.5 w-2.5 rounded-full" style="background:{ring.color}"></span>
				<span class="text-muted-foreground">
					{ring.label}
				</span>
				<span class="tabular-nums font-medium">
					{ring.consumed}/{ring.goal}{ring.unit}
				</span>
				<span class="tabular-nums text-muted-foreground">
					{pct}%
				</span>
			</div>
		{/each}
	</div>
</div>

<style>
	.ring-progress {
		transition: stroke-dashoffset 0.6s ease;
	}
</style>
