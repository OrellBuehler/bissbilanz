<script lang="ts">
	import type { MacroTotals } from '$lib/utils/nutrition';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		totals: MacroTotals;
		round?: boolean;
		gridClass?: string;
	};

	let { totals, round = false, gridClass = 'grid-cols-2' }: Props = $props();

	const fmt = (n: number) => (round ? Math.round(n) : n);
</script>

<div class={`grid gap-2 text-sm ${gridClass}`}>
	<div>{m.macro_calories()} {fmt(totals.calories)}</div>
	<div>{m.macro_protein()} {fmt(totals.protein)}g</div>
	<div>{m.macro_carbs()} {fmt(totals.carbs)}g</div>
	<div>{m.macro_fat()} {fmt(totals.fat)}g</div>
	<div>{m.macro_fiber()} {fmt(totals.fiber)}g</div>
</div>
