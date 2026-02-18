<script lang="ts">
	import { today, daysAgo } from '$lib/utils/dates';
	import * as m from '$lib/paraglide/messages';

	let { onRangeChange }: { onRangeChange: (start: string, end: string) => void } = $props();

	let activeRange: '7d' | '30d' | 'custom' = $state('7d');
	let customStart = $state('');
	let customEnd = $state('');

	const maxDate = today();

	const selectRange = (range: '7d' | '30d' | 'custom') => {
		activeRange = range;
		if (range === '7d') {
			onRangeChange(daysAgo(7), today());
		} else if (range === '30d') {
			onRangeChange(daysAgo(30), today());
		}
	};

	const applyCustomRange = () => {
		if (customStart && customEnd && customStart <= customEnd) {
			onRangeChange(customStart, customEnd);
		}
	};

	const ranges = [
		{ key: '7d' as const, label: () => m.charts_7d() },
		{ key: '30d' as const, label: () => m.charts_30d() },
		{ key: 'custom' as const, label: () => m.charts_custom() }
	];
</script>

<div class="flex flex-wrap items-center gap-3">
	<div class="bg-muted inline-flex rounded-full p-1">
		{#each ranges as range}
			<button
				class="relative rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 {activeRange === range.key
					? 'bg-background text-foreground shadow-sm'
					: 'text-muted-foreground hover:text-foreground'}"
				onclick={() => selectRange(range.key)}
			>
				{range.label()}
			</button>
		{/each}
	</div>

	{#if activeRange === 'custom'}
		<div class="flex items-center gap-2">
			<input
				type="date"
				class="border-input bg-background rounded-lg border px-3 py-1.5 text-sm"
				max={customEnd || maxDate}
				bind:value={customStart}
				onchange={applyCustomRange}
			/>
			<span class="text-muted-foreground text-sm">–</span>
			<input
				type="date"
				class="border-input bg-background rounded-lg border px-3 py-1.5 text-sm"
				min={customStart}
				max={maxDate}
				bind:value={customEnd}
				onchange={applyCustomRange}
			/>
		</div>
	{/if}
</div>
