<script lang="ts">
	import DashboardCard from '$lib/components/dashboard/DashboardCard.svelte';
	import Flame from '@lucide/svelte/icons/flame';
	import * as m from '$lib/paraglide/messages';

	let {
		currentStreak,
		longestStreak
	}: {
		currentStreak: number;
		longestStreak: number;
	} = $props();

	const isPersonalBest = $derived(currentStreak === longestStreak && currentStreak > 0);
	const daysLabel = $derived(
		currentStreak === 1 ? m.streaks_day() : m.streaks_days({ count: String(currentStreak) })
	);
	const longestLabel = $derived(m.streaks_longest({ count: String(longestStreak) }));
</script>

<DashboardCard title={m.streaks_title()} Icon={Flame} tone="amber">
	<div class="flex items-baseline gap-2">
		<span class="text-3xl font-bold tabular-nums">{currentStreak}</span>
		<span class="text-muted-foreground text-sm">
			{currentStreak === 1 ? m.streaks_day() : m.streaks_days({ count: '' }).replace(/^\d*\s*/, '')}
		</span>
		{#if isPersonalBest}
			<span
				class="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400"
			>
				{m.streaks_personal_best()}
			</span>
		{/if}
	</div>
	{#if currentStreak === 0}
		<p class="text-muted-foreground mt-1 text-sm">
			{#if longestStreak > 0}
				{longestLabel}
			{:else}
				{m.streaks_no_streak()}
			{/if}
		</p>
	{:else if !isPersonalBest && longestStreak > 0}
		<p class="text-muted-foreground mt-1 text-sm">{longestLabel}</p>
	{/if}
</DashboardCard>
