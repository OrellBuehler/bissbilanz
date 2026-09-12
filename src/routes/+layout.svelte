<script lang="ts">
	import '../app.css';
	import { Toaster } from '$lib/components/ui/sonner/index.js';
	import { beforeNavigate, onNavigate } from '$app/navigation';
	import { updated } from '$app/state';
	import { IsMobile } from '$lib/hooks/is-mobile.svelte.js';
	import { pwaInfo } from 'virtual:pwa-info';

	let { children } = $props();

	const isMobile = new IsMobile();
	const webManifestLink = pwaInfo?.webManifest.linkTag ?? '';

	// Once a newer build is live (svelte.config.js polls version.json), leave
	// the stale bundle with a full-page navigation instead of importing chunks
	// the deploy has already deleted.
	beforeNavigate(({ willUnload, to }) => {
		if (updated.current && !willUnload && to?.url) {
			location.href = to.url.href;
		}
	});

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
	{@html webManifestLink}
</svelte:head>

{@render children()}
<Toaster />
