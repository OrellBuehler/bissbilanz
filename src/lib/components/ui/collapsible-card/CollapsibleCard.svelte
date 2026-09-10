<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { onMount, type Snippet } from 'svelte';

	let {
		title,
		sectionId,
		subtitle = null,
		defaultOpen = true,
		contentClass,
		children
	}: {
		title: string;
		sectionId: string;
		subtitle?: string | null;
		defaultOpen?: boolean;
		contentClass?: string;
		children: Snippet;
	} = $props();
	let userChoice = $state<boolean | null>(null);
	const open = $derived(userChoice ?? defaultOpen);
	const storageKey = `insights.${sectionId}.collapsed`;
	onMount(() => {
		try {
			const stored = localStorage.getItem(storageKey);
			if (stored === 'true' || stored === 'false') userChoice = stored === 'false';
			else {
				const legacyKey = `insights.section.${sectionId}.open`;
				const legacy = localStorage.getItem(legacyKey);
				if (legacy === 'true' || legacy === 'false') {
					userChoice = legacy === 'true';
					localStorage.setItem(storageKey, String(!userChoice));
					localStorage.removeItem(legacyKey);
				}
			}
		} catch {
			/* Blocked storage keeps the data-driven default. */
		}
	});
	function changeOpen(value: boolean) {
		userChoice = value;
		try {
			localStorage.setItem(storageKey, String(!value));
		} catch {
			/* Storage is optional. */
		}
	}
</script>

<Card.Root>
	<Collapsible.Root {open} onOpenChange={changeOpen}>
		<Card.Header>
			<Collapsible.Trigger
				class="flex w-full items-center justify-between gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<span class="min-w-0"
					><span class="block text-sm font-semibold">{title}</span>
					{#if subtitle}<span class="mt-0.5 block text-xs text-muted-foreground">{subtitle}</span
						>{/if}
				</span>
				<ChevronDown
					class="size-4 shrink-0 transition-transform duration-200 {open ? '' : '-rotate-90'}"
				/>
			</Collapsible.Trigger>
		</Card.Header>
		<Collapsible.Content
			><Card.Content class={contentClass}>{@render children()}</Card.Content></Collapsible.Content
		>
	</Collapsible.Root>
</Card.Root>
