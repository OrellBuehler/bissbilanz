<script lang="ts">
	import { setInsightPinContext } from '$lib/insights/context';
	import type { InsightCardDefinition } from '$lib/insights/registry';
	import type { AnalyticsBundle } from '$lib/insights/sources';
	import InsightCardError from './InsightCardError.svelte';

	let {
		card,
		bundle,
		loading,
		pinned,
		onTogglePin,
		sourceError = false
	}: {
		card: InsightCardDefinition;
		bundle: AnalyticsBundle;
		loading: boolean;
		pinned: boolean;
		onTogglePin: () => void;
		/** True when at least one of this card's declared sources failed to load. */
		sourceError?: boolean;
	} = $props();

	setInsightPinContext(() => ({ id: card.id, pinned, toggle: onTogglePin }));

	const CardComponent = $derived(card.component);
	const cardProps = $derived(card.props(bundle, loading));
</script>

{#if sourceError && !loading}
	<InsightCardError title={card.title()} />
{:else}
	<CardComponent {...cardProps} />
{/if}
