<script lang="ts">
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { onMount, type Snippet } from 'svelte';
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

	const storageKey = `insights.section.${sectionId}.open`;

	// Sections without enough data stay collapsed so the page isn't a wall of
	// empty states; an explicit choice wins and is remembered per device.
	let userChoice = $state<boolean | null>(null);
	const open = $derived(userChoice ?? missingDays === 0);

	onMount(() => {
		try {
			const stored = localStorage.getItem(storageKey);
			if (stored === 'true') userChoice = true;
			else if (stored === 'false') userChoice = false;
		} catch {
			// private mode / blocked storage: fall back to the derived default
		}
	});

	const toggle = () => {
		userChoice = !open;
		try {
			localStorage.setItem(storageKey, String(userChoice));
		} catch {
			// ignore
		}
	};

	const subtitle = $derived.by(() => {
		if (loading) return null;
		if (missingDays > 0) return m.insights_section_needs_days({ count: missingDays.toString() });
		return teaser;
	});
</script>

<Collapsible.Root {open}>
	<section class="rounded-xl border bg-card">
		<button
			type="button"
			class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left sm:px-5"
			aria-expanded={open}
			onclick={toggle}
		>
			<span class="min-w-0">
				<span class="block truncate text-sm font-semibold tracking-tight">{title}</span>
				<span class="text-muted-foreground mt-0.5 block truncate text-xs tabular-nums">
					{#if subtitle}
						{subtitle}
					{:else}
						{m.insights_section_card_count({ count: cardCount.toString() })}
					{/if}
				</span>
			</span>
			<ChevronDown
				class="text-muted-foreground size-4 shrink-0 transition-transform duration-200 {open
					? ''
					: '-rotate-90'}"
			/>
		</button>
		<Collapsible.Content>
			<div class="grid gap-4 px-4 pb-4 sm:px-5 sm:pb-5 lg:grid-cols-2">
				{@render children()}
			</div>
		</Collapsible.Content>
	</section>
</Collapsible.Root>
