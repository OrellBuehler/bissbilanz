<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';

	type Props = {
		onScan: (barcode: string) => void;
		onError?: (error: string) => void;
	};

	let { onScan, onError }: Props = $props();

	let scanner: any = null;
	let scannerReady = $state(false);
	let error = $state('');

	onMount(async () => {
		if (!browser) return;

		try {
			const { Html5Qrcode } = await import('html5-qrcode');
			scanner = new Html5Qrcode('barcode-reader');

			await scanner.start(
				{ facingMode: 'environment' },
				{ fps: 10, qrbox: { width: 250, height: 100 } },
				(decodedText: string) => {
					onScan(decodedText);
				},
				() => {}
			);
			scannerReady = true;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Camera access denied';
			onError?.(error);
		}
	});

	onDestroy(() => {
		if (scanner && scannerReady) {
			scanner.stop().catch(() => {});
		}
	});
</script>

<div class="space-y-4">
	{#if error}
		<p class="text-red-500">{error}</p>
	{/if}
	<div id="barcode-reader" class="mx-auto w-full max-w-md"></div>
	{#if !scannerReady && !error}
		<p class="text-center text-neutral-500">Starting camera...</p>
	{/if}
</div>
