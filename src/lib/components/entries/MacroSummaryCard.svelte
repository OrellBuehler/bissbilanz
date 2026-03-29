<script lang="ts">
	import type { MacroTotals } from '$lib/utils/nutrition';
	import DashboardCard from '$lib/components/dashboard/DashboardCard.svelte';
	import * as m from '$lib/paraglide/messages';
	import ChartPie from '@lucide/svelte/icons/chart-pie';

	type Props = {
		totals: MacroTotals;
	};

	let { totals }: Props = $props();
</script>

<DashboardCard title={m.dashboard_summary()} Icon={ChartPie} tone="violet" class="@container">
	<div class="grid grid-cols-2 gap-2 text-sm @lg:grid-cols-5">
		<div
			class="rounded-xl border border-blue-200/60 bg-blue-50/60 px-3 py-2.5 dark:border-blue-900/40 dark:bg-blue-950/20"
		>
			<div class="text-[11px] font-medium text-blue-700/80 dark:text-blue-300/80">
				{m.macro_calories()}
			</div>
			<div class="mt-1 text-lg font-bold tabular-nums text-blue-600 dark:text-blue-400">
				{Math.round(totals.calories)}
			</div>
		</div>
		<div
			class="rounded-xl border border-red-200/60 bg-red-50/60 px-3 py-2.5 dark:border-red-900/40 dark:bg-red-950/20"
		>
			<div class="text-[11px] font-medium text-red-700/80 dark:text-red-300/80">
				{m.macro_protein()}
			</div>
			<div class="mt-1 text-base font-bold tabular-nums text-red-600 dark:text-red-400">
				{Math.round(totals.protein)}g
			</div>
		</div>
		<div
			class="rounded-xl border border-orange-200/60 bg-orange-50/60 px-3 py-2.5 dark:border-orange-900/40 dark:bg-orange-950/20"
		>
			<div class="text-[11px] font-medium text-orange-700/80 dark:text-orange-300/80">
				{m.macro_carbs()}
			</div>
			<div class="mt-1 text-base font-bold tabular-nums text-orange-600 dark:text-orange-400">
				{Math.round(totals.carbs)}g
			</div>
		</div>
		<div
			class="rounded-xl border border-yellow-200/60 bg-yellow-50/60 px-3 py-2.5 dark:border-yellow-900/40 dark:bg-yellow-950/20"
		>
			<div class="text-[11px] font-medium text-yellow-700/80 dark:text-yellow-300/80">
				{m.macro_fat()}
			</div>
			<div class="mt-1 text-base font-bold tabular-nums text-yellow-700 dark:text-yellow-300">
				{Math.round(totals.fat)}g
			</div>
		</div>
		<div
			class="rounded-xl border border-green-200/60 bg-green-50/60 px-3 py-2.5 dark:border-green-900/40 dark:bg-green-950/20"
		>
			<div class="text-[11px] font-medium text-green-700/80 dark:text-green-300/80">
				{m.macro_fiber()}
			</div>
			<div class="mt-1 text-base font-bold tabular-nums text-green-600 dark:text-green-400">
				{Math.round(totals.fiber)}g
			</div>
		</div>
	</div>
</DashboardCard>
