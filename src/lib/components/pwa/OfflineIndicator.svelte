<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { getSyncState } from '$lib/stores/sync-state.svelte';
	import WifiOff from '@lucide/svelte/icons/wifi-off';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import * as m from '$lib/paraglide/messages';

	let online = $state(browser ? navigator.onLine : true);
	const sync = getSyncState();

	onMount(() => {
		const goOnline = () => (online = true);
		const goOffline = () => (online = false);
		window.addEventListener('online', goOnline);
		window.addEventListener('offline', goOffline);
		return () => {
			window.removeEventListener('online', goOnline);
			window.removeEventListener('offline', goOffline);
		};
	});
</script>

{#if !online}
	<div
		class="flex items-center justify-center gap-2 bg-destructive px-4 py-1 text-xs text-destructive-foreground"
	>
		<WifiOff class="h-3 w-3" />
		<span>
			{m.pwa_offline()}
			{#if sync.pendingCount > 0}
				({sync.pendingCount})
			{/if}
		</span>
	</div>
{:else if sync.isSyncing}
	<div
		class="flex items-center justify-center gap-2 bg-primary px-4 py-1 text-xs text-primary-foreground"
	>
		<Loader2 class="h-3 w-3 animate-spin" />
		<span>{m.pwa_syncing()}</span>
	</div>
{/if}
