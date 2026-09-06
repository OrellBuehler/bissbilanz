<script lang="ts">
	import type { SummaryTile } from '$lib/insights/summary';

	let { tiles }: { tiles: SummaryTile[] } = $props();

	const accentClass = (accent: SummaryTile['accent']) => {
		if (accent === 'calories') return 'text-blue-600 dark:text-blue-400';
		if (accent === 'protein') return 'text-red-600 dark:text-red-400';
		if (accent === 'carbs') return 'text-orange-600 dark:text-orange-400';
		if (accent === 'fat') return 'text-yellow-600 dark:text-yellow-400';
		if (accent === 'fiber') return 'text-green-600 dark:text-green-400';
		return 'text-foreground';
	};
</script>

<div class="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
	{#each tiles as tile (tile.label)}
		<div class="rounded-xl border bg-card p-3">
			<div class="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">
				{tile.label}
			</div>
			<div class="mt-1 text-lg font-semibold tabular-nums {accentClass(tile.accent)}">
				{tile.value}
			</div>
			{#if tile.hint}
				<div class="text-muted-foreground mt-0.5 truncate text-[11px]">{tile.hint}</div>
			{/if}
		</div>
	{/each}
</div>
