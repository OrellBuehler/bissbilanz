<script lang="ts">
	import { useRegisterSW } from 'virtual:pwa-register/svelte';
	import * as m from '$lib/paraglide/messages';
	import { browser } from '$app/environment';

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
		class="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-sm rounded-lg border bg-background p-4 shadow-lg"
	>
		<p class="text-sm font-medium">{m.pwa_update_available()}</p>
		<div class="mt-2 flex gap-3">
			<button onclick={reload} class="text-sm font-medium text-primary underline">
				{m.pwa_update_refresh()}
			</button>
			<button onclick={() => (updated = false)} class="text-sm text-muted-foreground">
				{m.pwa_update_dismiss()}
			</button>
		</div>
	</div>
{/if}
