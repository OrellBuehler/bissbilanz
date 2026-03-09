<script lang="ts">
	import { useRegisterSW } from 'virtual:pwa-register/svelte';
	import * as m from '$lib/paraglide/messages';
	import { browser } from '$app/environment';

	useRegisterSW();

	let updated = $state(false);

	if (browser) {
		let currentController = navigator.serviceWorker?.controller;
		navigator.serviceWorker?.addEventListener('controllerchange', () => {
			if (currentController) {
				updated = true;
			}
			currentController = navigator.serviceWorker.controller;
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
		<button onclick={reload} class="mt-2 text-sm font-medium text-primary underline">
			{m.pwa_update_refresh()}
		</button>
	</div>
{/if}
