<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { today } from '$lib/utils/dates';
	import * as m from '$lib/paraglide/messages';

	let { onRangeChange }: { onRangeChange: (start: string, end: string) => void } = $props();

	let activeRange: '7d' | '30d' | 'custom' = $state('7d');
	let customStart = $state('');
	let customEnd = $state('');

	const getDaysAgo = (days: number) => {
		const d = new Date();
		d.setDate(d.getDate() - (days - 1));
		return d.toISOString().slice(0, 10);
	};

	const selectRange = (range: '7d' | '30d' | 'custom') => {
		activeRange = range;
		if (range === '7d') {
			onRangeChange(getDaysAgo(7), today());
		} else if (range === '30d') {
			onRangeChange(getDaysAgo(30), today());
		}
	};

	const applyCustomRange = () => {
		if (customStart && customEnd) {
			onRangeChange(customStart, customEnd);
		}
	};
</script>

<div class="flex flex-wrap items-center gap-2">
	<div class="flex gap-1">
		<Button
			variant={activeRange === '7d' ? 'default' : 'outline'}
			size="sm"
			onclick={() => selectRange('7d')}
		>
			{m.charts_7d()}
		</Button>
		<Button
			variant={activeRange === '30d' ? 'default' : 'outline'}
			size="sm"
			onclick={() => selectRange('30d')}
		>
			{m.charts_30d()}
		</Button>
		<Button
			variant={activeRange === 'custom' ? 'default' : 'outline'}
			size="sm"
			onclick={() => selectRange('custom')}
		>
			{m.charts_custom()}
		</Button>
	</div>
	{#if activeRange === 'custom'}
		<div class="flex items-center gap-2">
			<label class="text-muted-foreground text-sm">
				{m.charts_start_date()}
				<input
					type="date"
					class="border-input bg-background ml-1 rounded border px-2 py-1 text-sm"
					bind:value={customStart}
					onchange={applyCustomRange}
				/>
			</label>
			<label class="text-muted-foreground text-sm">
				{m.charts_end_date()}
				<input
					type="date"
					class="border-input bg-background ml-1 rounded border px-2 py-1 text-sm"
					bind:value={customEnd}
					onchange={applyCustomRange}
				/>
			</label>
		</div>
	{/if}
</div>
