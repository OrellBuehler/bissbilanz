<script lang="ts">
	import { useRegisterSW } from 'virtual:pwa-register/svelte';
	import * as m from '$lib/paraglide/messages';
	import { browser } from '$app/environment';
	import { Button } from '$lib/components/ui/button/index.js';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import X from '@lucide/svelte/icons/x';

	useRegisterSW();

	let updated = $state(false);

	if (browser) {
		$effect(() => {
			let currentController = navigator.serviceWorker?.controller;
			const handler = () => {
				if (currentController) updated = true;
				currentController = navigator.serviceWorker.controller;
			};
			navigator.serviceWorker?.addEventListener('controllerchange', handler);
			return () => navigator.serviceWorker?.removeEventListener('controllerchange', handler);
		});
	}

	function reload() {
		window.location.reload();
	}
</script>

{#if updated}
	<div
		class="fixed inset-x-0 bottom-4 z-50 mx-auto flex w-[calc(100%-2rem)] max-w-sm items-center gap-3 rounded-lg border bg-background p-3 shadow-lg sm:bottom-6"
	>
		<RefreshCw class="h-4 w-4 shrink-0 text-primary" />
		<p class="flex-1 text-sm font-medium">{m.pwa_update_available()}</p>
		<div class="flex shrink-0 items-center gap-1">
			<Button variant="default" size="sm" onclick={reload}>
				{m.pwa_update_refresh()}
			</Button>
			<Button variant="ghost" size="icon" class="h-8 w-8" onclick={() => (updated = false)}>
				<X class="h-4 w-4" />
				<span class="sr-only">{m.pwa_update_dismiss()}</span>
			</Button>
		</div>
	</div>
{/if}
