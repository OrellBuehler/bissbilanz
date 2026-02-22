<script lang="ts">
	import type { MacroTotals } from '$lib/utils/nutrition';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as m from '$lib/paraglide/messages';
	import ChartPie from '@lucide/svelte/icons/chart-pie';

	type Props = {
		totals: MacroTotals;
	};

	let { totals }: Props = $props();
</script>

<Card.Root>
	<Card.Header class="pb-2">
		<Card.Title class="flex items-center gap-2 text-base">
			<ChartPie class="h-4 w-4" />
			{m.dashboard_summary()}
		</Card.Title>
	</Card.Header>
	<Card.Content>
		<div class="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
			<div class="flex flex-col">
				<span class="text-muted-foreground text-xs">{m.macro_calories()}</span>
				<span class="font-semibold text-blue-500">{Math.round(totals.calories)}</span>
			</div>
			<div class="flex flex-col">
				<span class="text-muted-foreground text-xs">{m.macro_protein()}</span>
				<span class="font-semibold text-red-500">{Math.round(totals.protein)}g</span>
			</div>
			<div class="flex flex-col">
				<span class="text-muted-foreground text-xs">{m.macro_carbs()}</span>
				<span class="font-semibold text-orange-500">{Math.round(totals.carbs)}g</span>
			</div>
			<div class="flex flex-col">
				<span class="text-muted-foreground text-xs">{m.macro_fat()}</span>
				<span class="font-semibold text-yellow-500">{Math.round(totals.fat)}g</span>
			</div>
			<div class="flex flex-col">
				<span class="text-muted-foreground text-xs">{m.macro_fiber()}</span>
				<span class="font-semibold text-green-500">{Math.round(totals.fiber)}g</span>
			</div>
		</div>
	</Card.Content>
</Card.Root>
