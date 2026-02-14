<script lang="ts">
	import { browser } from '$app/environment';
	import WifiOff from '@lucide/svelte/icons/wifi-off';
	import * as m from '$lib/paraglide/messages';

	let online = $state(browser ? navigator.onLine : true);

	if (browser) {
		window.addEventListener('online', () => (online = true));
		window.addEventListener('offline', () => (online = false));
	}
</script>

{#if !online}
	<div
		class="flex items-center justify-center gap-2 bg-destructive px-4 py-1 text-xs text-destructive-foreground"
	>
		<WifiOff class="h-3 w-3" />
		<span>{m.pwa_offline()}</span>
	</div>
{/if}
