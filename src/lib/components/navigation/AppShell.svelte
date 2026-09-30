<script lang="ts">
	import AppSidebar from '$lib/components/navigation/app-sidebar.svelte';
	import SiteHeader from '$lib/components/navigation/site-header.svelte';
	import MobileHeader from '$lib/components/navigation/mobile-header.svelte';
	import BottomTabBar from '$lib/components/navigation/bottom-tab-bar.svelte';
	import OfflineIndicator from '$lib/components/pwa/OfflineIndicator.svelte';
	import SyncErrorBanner from '$lib/components/pwa/SyncErrorBanner.svelte';
	import SyncConflictBanner from '$lib/components/pwa/SyncConflictBanner.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<!--
	One shared tree for both breakpoints. The chrome (sidebar, headers, tab bar)
	swaps via CSS, but `children` is rendered exactly once so page components
	mount once — rendering it per breakpoint ran every page effect twice.
-->
<Sidebar.Provider
	class="min-h-dvh"
	style="--sidebar-width: calc(var(--spacing) * 72); --header-height: calc(var(--spacing) * 12);"
>
	<AppSidebar variant="inset" />
	<Sidebar.Inset class="md:h-[calc(100svh-1rem)] md:overflow-hidden">
		<SiteHeader />
		<MobileHeader />
		<OfflineIndicator />
		<SyncErrorBanner />
		<SyncConflictBanner />
		<div
			class="min-h-0 flex-1 px-3 py-3 pb-[calc(5rem+env(safe-area-inset-bottom))] md:overflow-auto md:p-4 md:pb-4 lg:p-6"
		>
			{@render children()}
		</div>
	</Sidebar.Inset>
</Sidebar.Provider>
<BottomTabBar />
