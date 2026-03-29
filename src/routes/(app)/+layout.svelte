<script lang="ts">
	import { setUser } from '$lib/stores/auth.svelte';
	import { startSyncListener, refreshPendingCount } from '$lib/stores/sync';
	import { migrateOldOfflineQueue, ensureUserScope } from '$lib/db';
	import AppSidebar from '$lib/components/navigation/app-sidebar.svelte';
	import SiteHeader from '$lib/components/navigation/site-header.svelte';
	import MobileHeader from '$lib/components/navigation/mobile-header.svelte';
	import BottomTabBar from '$lib/components/navigation/bottom-tab-bar.svelte';
	import InstallBanner from '$lib/components/pwa/InstallBanner.svelte';
	import OfflineIndicator from '$lib/components/pwa/OfflineIndicator.svelte';
	import UpdateToast from '$lib/components/pwa/UpdateToast.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import type { LayoutData } from './$types';
	import { onMount } from 'svelte';

	let { data, children }: { data: LayoutData; children: any } = $props();

	function edgeSwipeAction(node: HTMLElement) {
		let startX = 0;
		let startY = 0;

		function onTouchStart(e: TouchEvent) {
			startX = e.touches[0].clientX;
			startY = e.touches[0].clientY;
		}

		function onTouchEnd(e: TouchEvent) {
			const dx = e.changedTouches[0].clientX - startX;
			const dy = e.changedTouches[0].clientY - startY;
			if (startX < 30 && dx > 80 && Math.abs(dx) > Math.abs(dy) * 2) {
				history.back();
			}
		}

		node.addEventListener('touchstart', onTouchStart, { passive: true });
		node.addEventListener('touchend', onTouchEnd, { passive: true });

		return {
			destroy() {
				node.removeEventListener('touchstart', onTouchStart);
				node.removeEventListener('touchend', onTouchEnd);
			}
		};
	}

	$effect(() => {
		setUser(data.user);
	});

	onMount(async () => {
		if (data.user?.id) {
			await ensureUserScope(data.user.id).catch(() => {});
		}
		migrateOldOfflineQueue().then(() => refreshPendingCount());
		startSyncListener();
	});
</script>

<InstallBanner />
<div use:edgeSwipeAction class="contents">
	<!-- Desktop: sidebar layout (hidden on mobile) -->
	<div class="hidden md:contents">
		<Sidebar.Provider
			style="--sidebar-width: calc(var(--spacing) * 72); --header-height: calc(var(--spacing) * 12);"
		>
			<AppSidebar variant="inset" />
			<Sidebar.Inset>
				<SiteHeader />
				<OfflineIndicator />
				<div class="flex flex-1 flex-col">
					<main class="flex-1 p-4 lg:p-6">
						{@render children()}
					</main>
				</div>
			</Sidebar.Inset>
		</Sidebar.Provider>
	</div>

	<!-- Mobile: bottom tab bar layout (hidden on desktop) -->
	<div class="flex min-h-dvh flex-col md:hidden">
		<MobileHeader />
		<OfflineIndicator />
		<main class="flex-1 px-3 py-3 pb-20">
			{@render children()}
		</main>
		<BottomTabBar />
	</div>
</div>
<UpdateToast />
