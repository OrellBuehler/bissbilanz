<script lang="ts">
	import { setInsightPinContext } from '$lib/insights/context';
	import type { InsightCardDefinition } from '$lib/insights/registry';
	import type { AnalyticsBundle } from '$lib/insights/sources';

	let {
		card,
		bundle,
		loading,
		pinned,
		onTogglePin
	}: {
		card: InsightCardDefinition;
		bundle: AnalyticsBundle;
		loading: boolean;
		pinned: boolean;
		onTogglePin: () => void;
	} = $props();

	setInsightPinContext(() => ({ id: card.id, pinned, toggle: onTogglePin }));

	const CardComponent = $derived(card.component);
	const cardProps = $derived(card.props(bundle, loading));
</script>

<CardComponent {...cardProps} />
