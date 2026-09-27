<script lang="ts">
	import type { ConfidenceLevel } from '$lib/analytics/correlation';
	import * as m from '$lib/paraglide/messages';
	import type { Snippet } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import Pin from '@lucide/svelte/icons/pin';
	import PinOff from '@lucide/svelte/icons/pin-off';
	import { getInsightPinContext } from '$lib/insights/context';

	const pinContext = getInsightPinContext();

	/** What `sampleSize` actually counts — cards mislabel this as "days" otherwise. */
	type SampleUnit = 'days' | 'nights' | 'weeks' | 'weigh-ins' | 'entries';

	let {
		title,
		headline,
		confidence,
		sampleSize,
		sampleUnit = 'days',
		insufficientReason,
		borderColor = 'border-blue-500',
		loading = false,
		skeletonClass = 'h-24',
		children
	}: {
		title: string;
		headline: string;
		confidence: ConfidenceLevel;
		sampleSize: number;
		/** Unit `sampleSize` is counted in. Defaults to 'days'. */
		sampleUnit?: SampleUnit;
		/**
		 * A pre-localized, metric-specific explanation of what's still missing
		 * (e.g. "2 more weigh-ins needed"). When omitted, falls back to a generic
		 * `7 - sampleSize` estimate in `sampleUnit` — and never claims "0 more"
		 * when that estimate isn't positive.
		 */
		insufficientReason?: string;
		borderColor?: string;
		loading?: boolean;
		skeletonClass?: string;
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

	const sampleBadge = $derived.by(() => {
		const count = sampleSize.toString();
		switch (sampleUnit) {
			case 'nights':
				return m.confidence_sample_nights({ count });
			case 'weeks':
				return m.confidence_sample_weeks({ count });
			case 'weigh-ins':
				return m.confidence_sample_weighins({ count });
			case 'entries':
				return m.confidence_sample_entries({ count });
			default:
				return m.confidence_sample_days({ count });
		}
	});

	// Never claims "0 more days": a card whose real threshold isn't the generic
	// 7-sample cutoff (TDEE needs both weigh-ins and calorie days, for example)
	// passes its own `insufficientReason` instead of relying on this estimate.
	const genericInsufficientMessage = $derived.by(() => {
		const needed = Math.max(0, 7 - sampleSize);
		if (needed <= 0) return m.confidence_data_needed_generic();
		const count = needed.toString();
		switch (sampleUnit) {
			case 'nights':
				return m.confidence_data_needed_nights({ count });
			case 'weeks':
				return m.confidence_data_needed_weeks({ count });
			case 'weigh-ins':
				return m.confidence_data_needed_weighins({ count });
			case 'entries':
				return m.confidence_data_needed_entries({ count });
			default:
				return m.confidence_data_needed_days({ count });
		}
	});

	const insufficientMessage = $derived(insufficientReason ?? genericInsufficientMessage);
</script>

{#if loading}
	<div class="rounded-lg border bg-card overflow-hidden">
		<div class="border-l-4 {borderColor} p-4 sm:p-5">
			<div class="bg-muted/50 {skeletonClass} animate-pulse rounded-lg"></div>
		</div>
	</div>
{:else}
	<div class="rounded-lg border {cardBorderClass} bg-card overflow-hidden">
		<div class="border-l-4 {borderColor} p-4 sm:p-5">
			<div class="flex items-start justify-between gap-2">
				<div class="min-w-0 flex-1">
					<p class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
						{title}
					</p>
					{#if confidence === 'insufficient'}
						<p class="text-sm font-medium text-muted-foreground">
							{insufficientMessage}
						</p>
						<p class="text-xs text-muted-foreground mt-1">{m.confidence_keep_logging()}</p>
					{:else}
						<p class="text-sm font-semibold leading-snug">{headline}</p>
					{/if}
				</div>
				<div class="flex shrink-0 items-center gap-1">
					{#if confidence !== 'insufficient'}
						<span class="rounded-full px-2 py-0.5 text-[11px] font-medium {badgeClass}">
							{#if confidence === 'high' || confidence === 'medium'}
								{sampleBadge}
							{:else}
								{m.confidence_low_badge()}
							{/if}
						</span>
					{/if}
					{#if pinContext}
						{@const ctx = pinContext()}
						<Button
							variant="ghost"
							size="icon"
							class="text-muted-foreground hover:text-foreground"
							aria-pressed={ctx.pinned}
							aria-label={ctx.pinned ? m.insights_unpin_action() : m.insights_pin_action()}
							title={ctx.pinned ? m.insights_unpin_action() : m.insights_pin_action()}
							onclick={() => ctx.toggle()}
						>
							{#if ctx.pinned}
								<PinOff class="size-4" />
							{:else}
								<Pin class="size-4" />
							{/if}
						</Button>
					{/if}
				</div>
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
{/if}
