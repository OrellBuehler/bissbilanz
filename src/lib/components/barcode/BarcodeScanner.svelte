<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { startCamera, stopCamera, mapCameraError } from '$lib/utils/camera';
	import { createBarcodeScanner } from '$lib/utils/barcode-detect';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		onScan: (barcode: string) => void;
		onError?: (error: string) => void;
	};

	let { onScan, onError }: Props = $props();

	let videoEl: HTMLVideoElement | undefined = $state();
	let stream: MediaStream | null = $state(null);
	let scanner: { stop: () => void } | null = null;
	let scannerReady = $state(false);
	let error = $state('');

	onMount(async () => {
		if (!browser || !videoEl) return;

		try {
			stream = await startCamera(videoEl);
		} catch (err) {
			const kind = mapCameraError(err);
			const messages: Record<string, () => string> = {
				permission_denied: m.barcode_camera_denied,
				not_found: m.barcode_camera_not_found,
				overconstrained: m.barcode_camera_overconstrained
			};
			error = (messages[kind] ?? m.barcode_camera_error)();
			onError?.(error);
			return;
		}

		try {
			scanner = await createBarcodeScanner(videoEl, onScan);
			scannerReady = true;
		} catch {
			error = m.barcode_camera_error();
			onError?.(error);
		}
	});

	onDestroy(() => {
		scanner?.stop();
		stopCamera(stream);
	});
</script>

<div class="space-y-4">
	<div class="relative mx-auto w-full max-w-md overflow-hidden rounded-lg">
		<video
			bind:this={videoEl}
			class="w-full"
			muted
			playsinline
			autoplay
			aria-label="Camera viewfinder for barcode scanning"
		></video>
		{#if scannerReady}
			<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
				<div
					class="border-primary h-24 w-64 rounded-lg border-2 shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]"
				></div>
			</div>
		{/if}
	</div>
	{#if !scannerReady && !error}
		<p class="text-center text-neutral-500">{m.barcode_starting()}</p>
	{/if}
</div>
