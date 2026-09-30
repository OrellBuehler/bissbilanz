<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import AppShell from '$lib/components/navigation/AppShell.svelte';
	import CommandPalette from '$lib/components/command/CommandPalette.svelte';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	// Opened from inside the app (sidebar, settings, a page's help link): keep the
	// app chrome. A direct visit or the mobile apps' web view loads the page fresh
	// and gets the standalone help center.
	let inApp = $state(false);
	afterNavigate(({ from }) => {
		const fromRoute = from?.route.id ?? '';
		if (fromRoute.startsWith('/(app)')) inApp = true;
		else if (!fromRoute.startsWith('/help')) inApp = false;
	});
</script>

{#if inApp}
	<AppShell>
		{@render children()}
	</AppShell>
	<CommandPalette />
{:else}
	{@render children()}
{/if}
