<script lang="ts">
	import CollapsibleCard from '$lib/components/ui/collapsible-card/CollapsibleCard.svelte';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import { type Snippet } from 'svelte';
	import * as m from '$lib/paraglide/messages';

	let {
		title,
		sectionId,
		teaser = null,
		cardCount = 0,
		missingDays = 0,
		loading = false,
		error = false,
		onRetry,
		children
	}: {
		title: string;
		sectionId: string;
		teaser?: string | null;
		cardCount?: number;
		missingDays?: number;
		loading?: boolean;
		/** True when at least one of the section's sources failed to load. */
		error?: boolean;
		onRetry?: () => void;
		children: Snippet;
	} = $props();

	const subtitle = $derived.by(() => {
		if (loading) return null;
		if (error) return m.insights_section_error();
		if (missingDays > 0) return m.insights_section_needs_days({ count: missingDays.toString() });
		return teaser;
	});
</script>

<CollapsibleCard
	{title}
	{sectionId}
	defaultOpen={missingDays === 0 || error}
	subtitle={subtitle ?? m.insights_section_card_count({ count: cardCount.toString() })}
	contentClass="grid gap-4 lg:grid-cols-2"
>
	{#if error}
		<Alert.Root variant="destructive" class="col-span-full">
			<TriangleAlert class="size-4" />
			<Alert.Description class="flex w-full flex-wrap items-center justify-between gap-2">
				<span>{m.insights_section_error()}</span>
				{#if onRetry}
					<Button variant="outline" size="sm" class="gap-1.5" onclick={onRetry}>
						<RefreshCw class="size-3.5" />
						{m.insights_retry()}
					</Button>
				{/if}
			</Alert.Description>
		</Alert.Root>
	{/if}
	{@render children()}
</CollapsibleCard>
