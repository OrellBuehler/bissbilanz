<script lang="ts">
	import { browser } from '$app/environment';
	import * as m from '$lib/paraglide/messages';

	let showUpdate = $state(false);

	if (browser && 'serviceWorker' in navigator) {
		navigator.serviceWorker.ready.then((registration) => {
			registration.addEventListener('updatefound', () => {
				const newWorker = registration.installing;
				newWorker?.addEventListener('statechange', () => {
					if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
						showUpdate = true;
					}
				});
			});
		});
	}

	function reload() {
		window.location.reload();
	}
</script>

{#if showUpdate}
	<div
		class="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-sm rounded-lg border bg-background p-4 shadow-lg"
	>
		<p class="text-sm font-medium">{m.pwa_update_available()}</p>
		<button onclick={reload} class="mt-2 text-sm font-medium text-primary underline">
			{m.pwa_update_refresh()}
		</button>
	</div>
{/if}
