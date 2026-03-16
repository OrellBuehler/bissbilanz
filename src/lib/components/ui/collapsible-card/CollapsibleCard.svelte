<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';

	let {
		title,
		sectionId,
		children
	}: {
		title: string;
		sectionId: string;
		children: Snippet;
	} = $props();

	const storageKey = `insights.${sectionId}.collapsed`;

	let open = $state(true);

	onMount(() => {
		const stored = localStorage.getItem(storageKey);
		if (stored === 'true') open = false;
	});

	function toggle() {
		open = !open;
		localStorage.setItem(storageKey, (!open).toString());
	}
</script>

<Card.Root>
	<Collapsible.Root bind:open>
		<Card.Header>
			<div class="flex items-center justify-between">
				<Card.Title>{title}</Card.Title>
				<Button variant="ghost" size="icon" onclick={toggle}>
					<ChevronDown
						class="size-4 transition-transform duration-200 {open ? '' : '-rotate-90'}"
					/>
				</Button>
			</div>
		</Card.Header>
		<Collapsible.Content>
			<Card.Content>
				{@render children()}
			</Card.Content>
		</Collapsible.Content>
	</Collapsible.Root>
</Card.Root>
