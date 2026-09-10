<script lang="ts">
	import { MACRO_TEXT_CLASS } from '$lib/utils/colors';
	import type { SummaryTile } from '$lib/insights/summary';

	let { tiles }: { tiles: SummaryTile[] } = $props();

	const accentClass = (accent: SummaryTile['accent']) =>
		!accent || accent === 'neutral' ? 'text-foreground' : MACRO_TEXT_CLASS[accent];
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
