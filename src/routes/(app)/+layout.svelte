<script lang="ts">
	import { setUser } from '$lib/stores/auth.svelte';
	import { startSyncListener } from '$lib/stores/sync';
	import AppSidebar from '$lib/components/navigation/app-sidebar.svelte';
	import SiteHeader from '$lib/components/navigation/site-header.svelte';
	import InstallBanner from '$lib/components/pwa/InstallBanner.svelte';
	import OfflineIndicator from '$lib/components/pwa/OfflineIndicator.svelte';
	import UpdateToast from '$lib/components/pwa/UpdateToast.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import type { LayoutData } from './$types';
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { useSwipe, type SwipeCustomEvent } from 'svelte-gestures';

	let { data, children }: { data: LayoutData; children: any } = $props();

	const swipeGesture = useSwipe(
		(e: SwipeCustomEvent) => {
			if (e.detail.direction === 'right') {
				history.back();
			}
		},
		() => ({ timeframe: 300, minSwipeDistance: 80, touchAction: 'pan-y' as const }),
		undefined,
		true
	);

	function swipeAction(node: HTMLElement) {
		node.addEventListener('swipe', swipeGesture.onswipe as EventListener);
		const cleanup = swipeGesture.swipe(node);
		return {
			destroy() {
				node.removeEventListener('swipe', swipeGesture.onswipe as EventListener);
				cleanup();
			}
		};
	}

	$effect(() => {
		setUser(data.user);
	});

	onMount(() => {
		startSyncListener(() => {
			invalidateAll();
			window.dispatchEvent(new CustomEvent('queue-synced'));
		});
	});
</script>

<InstallBanner />
<div use:swipeAction class="contents">
	<Sidebar.Provider
		style="--sidebar-width: calc(var(--spacing) * 72); --header-height: calc(var(--spacing) * 12);"
	>
		<AppSidebar variant="inset" />
		<Sidebar.Inset>
			<SiteHeader />
			<OfflineIndicator />
			<div class="flex flex-1 flex-col">
				<main class="flex-1 px-3 py-4 sm:p-4 lg:p-6">
					{@render children()}
				</main>
			</div>
		</Sidebar.Inset>
	</Sidebar.Provider>
</div>
<UpdateToast />
