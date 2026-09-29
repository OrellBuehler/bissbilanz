<script lang="ts">
	import * as Sentry from '@sentry/sveltekit';
	import { onMount } from 'svelte';
	import InsightsSection from './InsightsSection.svelte';
	import InsightCardHost from '$lib/components/analytics/InsightCardHost.svelte';
	import { cardsForGroup } from '$lib/insights/registry';
	import { INSIGHT_GROUPS, type InsightGroupId } from '$lib/insights/groups';
	import {
		EMPTY_ANALYTICS_BUNDLE,
		loadAnalyticsSources,
		type AnalyticsBundle,
		type AnalyticsSourceId
	} from '$lib/insights/sources';
	import { createPinStore } from '$lib/insights/pin-store.svelte';

	let { group }: { group: InsightGroupId } = $props();

	const meta = INSIGHT_GROUPS[group];
	const cards = cardsForGroup(group);
	const pinStore = createPinStore();

	let loading = $state(true);
	let bundle = $state<AnalyticsBundle>({ ...EMPTY_ANALYTICS_BUNDLE });
	let failedSources = $state<AnalyticsSourceId[]>([]);
	let controller: AbortController | null = null;

	function load() {
		controller?.abort();
		controller = new AbortController();
		const { signal } = controller;
		loading = true;
		(async () => {
			try {
				const result = await loadAnalyticsSources(
					cards.flatMap((card) => card.sources),
					signal
				);
				bundle = result.bundle;
				failedSources = result.failedSources;
			} catch (e) {
				if (e instanceof DOMException && e.name === 'AbortError') return;
				if (navigator.onLine)
					Sentry.captureException(e, { extra: { context: 'AnalyticsGroupSection.load' } });
			} finally {
				if (!signal.aborted) loading = false;
			}
		})();
	}

	onMount(() => {
		load();
		return () => controller?.abort();
	});

	const availableDays = $derived(loading ? 0 : meta.days(bundle));
	const missingDays = $derived(loading ? 0 : Math.max(0, meta.minDays - availableDays));
	const teaser = $derived(loading ? null : meta.teaser(bundle));
	const hasError = $derived(!loading && failedSources.length > 0);

	function cardHasError(cardSources: readonly AnalyticsSourceId[]): boolean {
		return cardSources.some((s) => failedSources.includes(s));
	}
</script>

<InsightsSection
	title={meta.title()}
	sectionId={group}
	{teaser}
	{missingDays}
	{loading}
	error={hasError}
	onRetry={load}
	cardCount={cards.length}
>
	{#each cards as card (card.id)}
		<InsightCardHost
			{card}
			{bundle}
			{loading}
			sourceError={cardHasError(card.sources)}
			pinned={pinStore.isPinned(card.id)}
			onTogglePin={() => pinStore.toggle(card.id)}
		/>
	{/each}
</InsightsSection>
