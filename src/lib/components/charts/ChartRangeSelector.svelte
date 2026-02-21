<script lang="ts">
	import { today, daysAgo } from '$lib/utils/dates';
	import * as m from '$lib/paraglide/messages';

	type RangeOption = { key: string; label: () => string; from?: string };

	let {
		onRangeChange,
		ranges: customRanges,
		activeRange: initialRange
	}: {
		onRangeChange: (start: string, end: string) => void;
		ranges?: RangeOption[];
		activeRange?: string;
	} = $props();

	const defaultRanges: RangeOption[] = [
		{ key: '7d', label: () => m.charts_7d() },
		{ key: '30d', label: () => m.charts_30d() },
		{ key: 'custom', label: () => m.charts_custom() }
	];

	const ranges = $derived(customRanges ?? defaultRanges);
	let activeRange = $state(initialRange ?? ranges[0]?.key ?? '7d');

	let customStart = $state('');
	let customEnd = $state('');

	const maxDate = today();

	const selectRange = (key: string) => {
		activeRange = key;
		if (key === 'custom') return;
		const range = ranges.find((r) => r.key === key);
		if (range?.from) {
			onRangeChange(range.from, today());
			return;
		}
		if (key === '7d') {
			onRangeChange(daysAgo(7), today());
		} else if (key === '30d') {
			onRangeChange(daysAgo(30), today());
		} else if (key === '90d') {
			onRangeChange(daysAgo(90), today());
		} else if (key === 'all') {
			onRangeChange('2000-01-01', today());
		}
	};

	const applyCustomRange = () => {
		if (customStart && customEnd && customStart <= customEnd) {
			onRangeChange(customStart, customEnd);
		}
	};
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
