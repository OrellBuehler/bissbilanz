<script lang="ts">
	import { onMount } from 'svelte';
	import InsightsSection from './InsightsSection.svelte';
	import InsightCardHost from '$lib/components/analytics/InsightCardHost.svelte';
	import { cardsForGroup } from '$lib/insights/registry';
	import { INSIGHT_GROUPS, type InsightGroupId } from '$lib/insights/groups';
	import {
		EMPTY_ANALYTICS_BUNDLE,
		loadAnalyticsSources,
		type AnalyticsBundle
	} from '$lib/insights/sources';
	import { createPinStore } from '$lib/insights/pin-store.svelte';

	let { group }: { group: InsightGroupId } = $props();

	const meta = INSIGHT_GROUPS[group];
	const cards = cardsForGroup(group);
	const pinStore = createPinStore();

	let loading = $state(true);
	let bundle = $state<AnalyticsBundle>({ ...EMPTY_ANALYTICS_BUNDLE });

	onMount(() => {
		const controller = new AbortController();
		(async () => {
			try {
				bundle = await loadAnalyticsSources(
					cards.flatMap((card) => card.sources),
					controller.signal
				);
			} catch (e) {
				if (e instanceof DOMException && e.name === 'AbortError') return;
			} finally {
				if (!controller.signal.aborted) loading = false;
			}
		})();
		return () => controller.abort();
	});

	const availableDays = $derived(loading ? 0 : meta.days(bundle));
	const missingDays = $derived(loading ? 0 : Math.max(0, meta.minDays - availableDays));
	const teaser = $derived(loading ? null : meta.teaser(bundle));
</script>

<InsightsSection
	title={meta.title()}
	sectionId={group}
	{teaser}
	{missingDays}
	{loading}
	cardCount={cards.length}
>
	{#each cards as card (card.id)}
		<InsightCardHost
			{card}
			{bundle}
			{loading}
			pinned={pinStore.isPinned(card.id)}
			onTogglePin={() => pinStore.toggle(card.id)}
		/>
	{/each}
</InsightsSection>
