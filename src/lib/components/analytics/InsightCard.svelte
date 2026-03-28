<script lang="ts">
	import type { ConfidenceLevel } from '$lib/analytics/correlation';
	import * as m from '$lib/paraglide/messages';
	import type { Snippet } from 'svelte';

	let {
		title,
		headline,
		confidence,
		sampleSize,
		borderColor = 'border-blue-500',
		children
	}: {
		title: string;
		headline: string;
		confidence: ConfidenceLevel;
		sampleSize: number;
		borderColor?: string;
		children: Snippet;
	} = $props();

	const badgeClass = $derived.by(() => {
		if (confidence === 'high')
			return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
		if (confidence === 'medium')
			return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
		if (confidence === 'low')
			return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
		return 'bg-muted text-muted-foreground';
	});

	const cardBorderClass = $derived.by(() => (confidence === 'low' ? 'border-dashed' : ''));
</script>

<div class="rounded-lg border {cardBorderClass} bg-card overflow-hidden">
	<div class="border-l-4 {borderColor} p-4 sm:p-5">
		<div class="flex items-start justify-between gap-3">
			<div class="min-w-0 flex-1">
				<p class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
					{title}
				</p>
				{#if confidence === 'insufficient'}
					<p class="text-sm font-medium text-muted-foreground">
						{m.confidence_data_needed({ days: Math.max(0, 7 - sampleSize).toString() })}
					</p>
					<p class="text-xs text-muted-foreground mt-1">{m.confidence_keep_logging()}</p>
				{:else}
					<p class="text-sm font-semibold leading-snug">{headline}</p>
				{/if}
			</div>
			{#if confidence !== 'insufficient'}
				<span class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium {badgeClass}">
					{#if confidence === 'high' || confidence === 'medium'}
						{m.confidence_high({ days: sampleSize.toString() })}
					{:else}
						{m.confidence_low_badge()}
					{/if}
				</span>
			{/if}
		</div>

		{#if confidence !== 'insufficient'}
			<div class="mt-4">
				{@render children()}
			</div>
			{#if confidence === 'low'}
				<p class="mt-3 text-[11px] text-amber-600 dark:text-amber-400">
					{m.confidence_low()}
				</p>
			{/if}
		{/if}
	</div>
</div>
