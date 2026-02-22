<script lang="ts">
	import { useRegisterSW } from 'virtual:pwa-register/svelte';
	import * as m from '$lib/paraglide/messages';

	const { needRefresh, updateServiceWorker } = useRegisterSW();

	function update() {
		updateServiceWorker(true);
	}
</script>

{#if $needRefresh}
	<div
		class="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-sm rounded-lg border bg-background p-4 shadow-lg"
	>
		<p class="text-sm font-medium">{m.pwa_update_available()}</p>
		<button onclick={update} class="mt-2 text-sm font-medium text-primary underline">
			{m.pwa_update_refresh()}
		</button>
	</div>
{/if}
