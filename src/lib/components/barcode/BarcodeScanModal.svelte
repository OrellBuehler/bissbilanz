<script lang="ts">
	import BarcodeScanner from './BarcodeScanner.svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import AlertCircle from '@lucide/svelte/icons/alert-circle';

	type Props = {
		open?: boolean;
		onClose: () => void;
		onBarcode: (barcode: string) => void;
	};

	let { open = false, onClose, onBarcode }: Props = $props();

	let error = $state('');

	const handleScan = (barcode: string) => {
		onBarcode(barcode);
		onClose();
	};

	const handleError = (err: string) => {
		error = err;
	};
</script>

<Dialog.Root bind:open onOpenChange={(o) => !o && onClose()}>
	<Dialog.Content class="max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Scan Barcode</Dialog.Title>
		</Dialog.Header>
		{#if error}
			<Alert.Root variant="destructive">
				<AlertCircle class="size-4" />
				<Alert.Title>Error</Alert.Title>
				<Alert.Description>{error}</Alert.Description>
			</Alert.Root>
		{/if}
		<BarcodeScanner onScan={handleScan} onError={handleError} />
	</Dialog.Content>
</Dialog.Root>
