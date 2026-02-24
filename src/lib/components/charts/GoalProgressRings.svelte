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
						unit: m.foods_kcal()
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
	const strokeWidth = 10;
	const gap = 3;
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
	<div class="relative h-[180px] w-[180px] sm:h-[220px] sm:w-[220px]">
		<svg
			viewBox="0 0 {size} {size}"
			class="h-full w-full -rotate-90"
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
		<div class="absolute inset-0 flex items-center justify-center text-center">
			<div>
				<span class="text-xl font-bold tabular-nums text-foreground"
					>{Math.round(totals.calories)}</span
				>
				<span class="block text-[10px] text-muted-foreground">{m.foods_kcal()}</span>
			</div>
		</div>
	</div>

	<div class="grid w-full max-w-xs gap-y-1 text-xs" style="grid-template-columns: auto 1fr auto auto;">
		{#each rings as ring}
			{@const isOver = ring.consumed > ring.goal && ring.goal > 0}
			{@const diff = Math.abs(Math.round((ring.consumed - ring.goal) * 10) / 10)}
			<span class="mr-1.5 inline-block h-2.5 w-2.5 self-center rounded-full" style="background:{ring.color}"></span>
			<span class="self-center text-muted-foreground">{ring.label}</span>
			<span class="self-center px-2 text-right tabular-nums font-medium">{ring.consumed}/{ring.goal} {ring.unit}</span>
			<span class="self-center tabular-nums text-muted-foreground">
				{#if isOver}
					{m.dashboard_over({ amount: `${diff} ${ring.unit}` })}
				{:else if ring.goal > 0}
					{m.dashboard_remaining({ amount: `${diff} ${ring.unit}` })}
				{/if}
			</span>
		{/each}
	</div>
</div>

<style>
	.ring-progress {
		transition: stroke-dashoffset 0.6s ease;
	}
</style>
