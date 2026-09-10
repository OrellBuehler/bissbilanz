<script lang="ts">
	import DashboardCard from '$lib/components/dashboard/DashboardCard.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import Pin from '@lucide/svelte/icons/pin';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import InsightCardHost from '$lib/components/analytics/InsightCardHost.svelte';
	import { INSIGHT_CARDS, sourcesForCards } from '$lib/insights/registry';
	import {
		EMPTY_ANALYTICS_BUNDLE,
		loadAnalyticsSources,
		type AnalyticsBundle
	} from '$lib/insights/sources';
	import { createPinStore } from '$lib/insights/pin-store.svelte';
	import * as m from '$lib/paraglide/messages';

	const pinStore = createPinStore();
	const cards = $derived(pinStore.pins.map((id) => INSIGHT_CARDS[id]));

	let loading = $state(true);
	let bundle = $state<AnalyticsBundle>({ ...EMPTY_ANALYTICS_BUNDLE });
	let loadedKey = '';

	// Only the sources the pinned cards declare are fetched, so Home never pulls
	// the full analytics surface.
	$effect(() => {
		const ids = pinStore.pins;
		const key = ids.join(',');
		if (key === loadedKey) return;
		if (ids.length === 0) {
			loadedKey = key;
			bundle = { ...EMPTY_ANALYTICS_BUNDLE };
			loading = false;
			return;
		}
		loadedKey = key;
		loading = true;
		const controller = new AbortController();
		(async () => {
			try {
				bundle = await loadAnalyticsSources(sourcesForCards(ids), controller.signal);
			} catch (e) {
				if (e instanceof DOMException && e.name === 'AbortError') return;
			} finally {
				if (!controller.signal.aborted) loading = false;
			}
		})();
		return () => controller.abort();
	});
</script>

{#if cards.length > 0}
	<DashboardCard title={m.insights_pinned_section()} Icon={Pin} tone="primary">
		{#snippet headerRight()}
			<Button variant="ghost" size="sm" href="/insights" class="gap-1.5">
				{m.insights_title()}
				<ArrowRight class="size-3.5" />
			</Button>
		{/snippet}

		<div class="grid gap-4 lg:grid-cols-2">
			{#each cards as card (card.id)}
				<InsightCardHost
					{card}
					{bundle}
					{loading}
					pinned={true}
					onTogglePin={() => pinStore.toggle(card.id)}
				/>
			{/each}
		</div>
	</DashboardCard>
{/if}
