<script lang="ts">
	import * as Sentry from '@sentry/sveltekit';
	import { setUser } from '$lib/stores/auth.svelte';
	import { startSyncListener, refreshPendingCount } from '$lib/stores/sync';
	import { migrateOldOfflineQueue, ensureUserScope } from '$lib/db';
	import { preferencesService } from '$lib/services/preferences-service.svelte';
	import InstallBanner from '$lib/components/pwa/InstallBanner.svelte';
	import UpdateToast from '$lib/components/pwa/UpdateToast.svelte';
	import AiTaskWatcher from '$lib/components/ai-tasks/AiTaskWatcher.svelte';
	import CommandPalette from '$lib/components/command/CommandPalette.svelte';
	import AppShell from '$lib/components/navigation/AppShell.svelte';
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
			// Only trigger back if there's history to go back to
			// On iOS PWA, history.back() with empty stack shows browser chrome
			if (startX < 30 && dx > 80 && Math.abs(dx) > Math.abs(dy) * 2 && history.length > 1) {
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

	$effect(() => {
		const vv = window.visualViewport;
		if (!vv) return;
		const update = () => {
			if (vv.height < window.innerHeight && vv.scale <= 1) {
				document.documentElement.style.setProperty('--visual-vh', `${vv.height}px`);
				document.documentElement.classList.add('kb-open');
			} else {
				document.documentElement.style.removeProperty('--visual-vh');
				document.documentElement.classList.remove('kb-open');
			}
		};
		update();
		vv.addEventListener('resize', update);
		return () => vv.removeEventListener('resize', update);
	});

	onMount(async () => {
		// Ensure Dexie data belongs to the current user (clears on user switch).
		// Awaited so no component reads stale data from a previous user.
		if (data.user?.id) {
			await ensureUserScope(data.user.id).catch((err) => Sentry.captureException(err));
		}
		// Migrate any pending items from the old bissbilanz-offline IndexedDB
		migrateOldOfflineQueue().then(() => refreshPendingCount());
		startSyncListener();
		// Report the device timezone so server-side analytics/MCP use the user's tz.
		if (data.user?.id) preferencesService.reportTimeZone();
	});
</script>

<InstallBanner />
<div use:edgeSwipeAction class="contents">
	<AppShell>
		{@render children()}
	</AppShell>
</div>
<UpdateToast />
<AiTaskWatcher />
<CommandPalette />
