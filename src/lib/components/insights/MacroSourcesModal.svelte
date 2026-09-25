<script lang="ts">
	import { ResponsiveModal } from '$lib/components/ui/responsive-modal/index.js';
	import { statsService } from '$lib/services/stats-service.svelte';
	import type { DayRow } from '$lib/utils/insights';
	import * as m from '$lib/paraglide/messages';

	type SourceMacro = 'protein' | 'carbs' | 'fat' | 'fiber';
	type TopFood = {
		foodId: string | null;
		recipeId: string | null;
		foodName: string;
		count: number;
	} & Record<SourceMacro, number>;

	let {
		open = $bindable(false),
		macro,
		label,
		color,
		days,
		rows
	}: {
		open: boolean;
		macro: SourceMacro;
		label: string;
		color: string;
		days: number;
		rows: DayRow[];
	} = $props();

	let foods = $state<TopFood[] | null>(null);
	let failed = $state(false);

	// `rows` covers the same window the server's top-foods uses, so the shares
	// line up with the listed totals.
	const periodTotal = $derived(rows.reduce((sum, row) => sum + row[macro], 0));

	$effect(() => {
		if (!open) return;
		const sort = macro;
		const range = days;
		let cancelled = false;
		foods = null;
		failed = false;
		statsService.getTopFoods(range, 10, sort).then((result) => {
			if (cancelled) return;
			if (result) foods = result.data;
			else failed = true;
		});
		return () => {
			cancelled = true;
		};
	});
</script>

<ResponsiveModal
	bind:open
	title={m.insights_macro_sources_title({ macro: label })}
	description={m.insights_macro_sources_subtitle({ days: days.toString() })}
>
	{#snippet children()}
		<div class="px-4 pb-4 md:px-0">
			{#if failed}
				<p class="text-muted-foreground py-6 text-center text-sm">
					{m.insights_macro_sources_failed()}
				</p>
			{:else if !foods}
				<p class="text-muted-foreground py-6 text-center text-sm">{m.add_food_loading()}</p>
			{:else if foods.length === 0}
				<p class="text-muted-foreground py-6 text-center text-sm">
					{m.insights_macro_sources_empty()}
				</p>
			{:else}
				<ol class="divide-y">
					{#each foods as food, i (food.foodId ?? food.recipeId ?? food.foodName)}
						{@const amount = food[macro] * food.count}
						{@const share = periodTotal > 0 ? Math.min(amount / periodTotal, 1) : 0}
						<li class="space-y-1.5 py-2.5">
							<div class="flex items-center gap-3">
								<span class="text-muted-foreground w-5 text-xs tabular-nums">{i + 1}.</span>
								<div class="min-w-0 flex-1">
									<div class="truncate text-sm font-medium">{food.foodName}</div>
									<div class="text-muted-foreground text-xs tabular-nums">
										{food.count}× · {Math.round(amount)} g
									</div>
								</div>
								<div class="text-right">
									<div class="text-sm font-semibold tabular-nums" style="color: {color}">
										{Math.round(share * 100)}%
									</div>
									<div class="text-muted-foreground text-[11px]">
										{m.insights_macro_sources_share()}
									</div>
								</div>
							</div>
							<div class="bg-muted ml-8 h-1 overflow-hidden rounded-full">
								<div
									class="h-full rounded-full"
									style="width: {share * 100}%; background-color: {color}"
								></div>
							</div>
						</li>
					{/each}
				</ol>
			{/if}
		</div>
	{/snippet}
</ResponsiveModal>
