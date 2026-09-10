<script lang="ts">
	import CollapsibleCard from '$lib/components/ui/collapsible-card/CollapsibleCard.svelte';
	import { type Snippet } from 'svelte';
	import * as m from '$lib/paraglide/messages';

	let {
		title,
		sectionId,
		teaser = null,
		cardCount = 0,
		missingDays = 0,
		loading = false,
		children
	}: {
		title: string;
		sectionId: string;
		teaser?: string | null;
		cardCount?: number;
		missingDays?: number;
		loading?: boolean;
		children: Snippet;
	} = $props();

	const subtitle = $derived.by(() => {
		if (loading) return null;
		if (missingDays > 0) return m.insights_section_needs_days({ count: missingDays.toString() });
		return teaser;
	});
</script>

<CollapsibleCard
	{title}
	{sectionId}
	defaultOpen={missingDays === 0}
	subtitle={subtitle ?? m.insights_section_card_count({ count: cardCount.toString() })}
	contentClass="grid gap-4 lg:grid-cols-2"
>
	{@render children()}
</CollapsibleCard>
