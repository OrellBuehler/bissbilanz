<script lang="ts">
	import { browser } from '$app/environment';
	import X from '@lucide/svelte/icons/x';
	import Download from '@lucide/svelte/icons/download';
	import * as m from '$lib/paraglide/messages';

	let deferredPrompt: any = $state(null);
	let dismissed = $state(false);

	if (browser) {
		dismissed = localStorage.getItem('bissbilanz-install-dismissed') === 'true';
		window.addEventListener('beforeinstallprompt', (e: Event) => {
			e.preventDefault();
			deferredPrompt = e;
		});
	}

	function install() {
		deferredPrompt?.prompt();
		deferredPrompt = null;
	}

	function dismiss() {
		dismissed = true;
		localStorage.setItem('bissbilanz-install-dismissed', 'true');
		deferredPrompt = null;
	}
</script>

{#if deferredPrompt && !dismissed}
	<div class="flex items-center gap-3 bg-primary/10 px-4 py-2 text-sm">
		<Download class="h-4 w-4 shrink-0" />
		<span class="flex-1">{m.pwa_install_prompt()}</span>
		<button onclick={install} class="font-medium text-primary underline">
			{m.pwa_install()}
		</button>
		<button onclick={dismiss} class="text-muted-foreground">
			<X class="h-4 w-4" />
		</button>
	</div>
{/if}
