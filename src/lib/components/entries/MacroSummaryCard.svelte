<script lang="ts">
	import type { MacroTotals } from '$lib/utils/nutrition';
	import DashboardCard from '$lib/components/dashboard/DashboardCard.svelte';
	import {
		MACRO_TEXT_CLASS,
		MACRO_LABEL_CLASS,
		MACRO_CARD_BG_CLASS,
		type MacroKey
	} from '$lib/utils/colors';
	import { formatKcal, formatGrams } from '$lib/utils/number';
	import * as m from '$lib/paraglide/messages';
	import ChartPie from '@lucide/svelte/icons/chart-pie';
	import Flame from '@lucide/svelte/icons/flame';

	type Props = {
		totals: MacroTotals;
		activityCalories?: number | null;
	};

	let { totals, activityCalories = null }: Props = $props();

	const rows: { key: MacroKey; label: string; value: string; size: string }[] = $derived([
		{
			key: 'calories',
			label: m.macro_calories(),
			value: formatKcal(totals.calories),
			size: 'text-lg'
		},
		{
			key: 'protein',
			label: m.macro_protein(),
			value: `${formatGrams(totals.protein)}g`,
			size: 'text-base'
		},
		{
			key: 'carbs',
			label: m.macro_carbs(),
			value: `${formatGrams(totals.carbs)}g`,
			size: 'text-base'
		},
		{ key: 'fat', label: m.macro_fat(), value: `${formatGrams(totals.fat)}g`, size: 'text-base' },
		{
			key: 'fiber',
			label: m.macro_fiber(),
			value: `${formatGrams(totals.fiber)}g`,
			size: 'text-base'
		}
	]);
</script>

<DashboardCard title={m.dashboard_summary()} Icon={ChartPie} tone="tertiary" class="@container">
	<div class="grid grid-cols-2 gap-2 text-sm @lg:grid-cols-5">
		{#each rows as row (row.key)}
			<div class="rounded-2xl px-3 py-2.5 {MACRO_CARD_BG_CLASS[row.key]}">
				<div class="text-[11px] font-medium {MACRO_LABEL_CLASS[row.key]}">
					{row.label}
				</div>
				<div class="mt-1 {row.size} font-bold tabular-nums {MACRO_TEXT_CLASS[row.key]}">
					{row.value}
				</div>
			</div>
		{/each}
	</div>
	{#if activityCalories != null && activityCalories > 0}
		<div class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
			<Flame class="size-3.5 text-orange-500" />
			<span class="font-medium tabular-nums text-foreground"
				>{m.day_summary_activity({ calories: activityCalories })}</span
			>
			<span>({m.day_summary_activity_hint()})</span>
		</div>
	{/if}
</DashboardCard>
