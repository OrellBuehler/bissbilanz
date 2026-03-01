<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { Toaster } from '$lib/components/ui/sonner/index.js';
	import { onNavigate } from '$app/navigation';
	import { IsMobile } from '$lib/hooks/is-mobile.svelte.js';

	let { children } = $props();

	const isMobile = new IsMobile();

	onNavigate((navigation) => {
		if (!document.startViewTransition) return;

		// Skip view transitions on mobile — the sidebar sheet close animation
		// conflicts with the view transition snapshot, causing a visible flash.
		if (isMobile.current) return;

		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
<Toaster />
