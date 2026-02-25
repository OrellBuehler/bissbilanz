<script lang="ts">
	import BarcodeScanner from './BarcodeScanner.svelte';
	import { ResponsiveModal } from '$lib/components/ui/responsive-modal/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import AlertCircle from '@lucide/svelte/icons/alert-circle';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		open?: boolean;
		onClose: () => void;
		onBarcode: (barcode: string) => void;
	};

	let { open = $bindable(false), onClose, onBarcode }: Props = $props();

	let error = $state('');

	let wasOpen = $state(false);
	$effect(() => {
		if (wasOpen && !open) {
			onClose();
		}
		wasOpen = open;
	});

	const handleScan = (barcode: string) => {
		onBarcode(barcode);
		onClose();
	};

	const handleError = (err: string) => {
		error = err;
	};
</script>

<ResponsiveModal bind:open title={m.barcode_title()}>
	{#if error}
		<Alert.Root variant="destructive">
			<AlertCircle class="size-4" />
			<Alert.Title>{m.barcode_error()}</Alert.Title>
			<Alert.Description>{error}</Alert.Description>
		</Alert.Root>
	{/if}
	<BarcodeScanner onScan={handleScan} onError={handleError} />
</ResponsiveModal>
