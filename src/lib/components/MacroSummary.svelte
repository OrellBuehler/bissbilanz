<script lang="ts">
	import type { MacroTotals } from '$lib/utils/nutrition';

	type Props = {
		totals: MacroTotals;
		round?: boolean;
		gridClass?: string;
	};

	let { totals, round = false, gridClass = 'grid-cols-2' }: Props = $props();

	const fmt = (n: number) => (round ? Math.round(n) : n);
</script>

<div class={`grid gap-2 text-sm ${gridClass}`}>
	<div>Calories: {fmt(totals.calories)}</div>
	<div>Protein: {fmt(totals.protein)}g</div>
	<div>Carbs: {fmt(totals.carbs)}g</div>
	<div>Fat: {fmt(totals.fat)}g</div>
	<div>Fiber: {fmt(totals.fiber)}g</div>
</div>
