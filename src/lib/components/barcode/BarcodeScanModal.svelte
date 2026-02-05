<script lang="ts">
	import BarcodeScanner from './BarcodeScanner.svelte';

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

{#if open}
	<div class="fixed inset-0 z-50 bg-black/40 p-6">
		<div class="mx-auto max-w-lg space-y-4 rounded bg-white p-6">
			<div class="flex items-center justify-between">
				<h3 class="text-lg font-semibold">Scan Barcode</h3>
				<button onclick={onClose}>Close</button>
			</div>
			{#if error}
				<p class="text-red-500">{error}</p>
			{/if}
			<BarcodeScanner onScan={handleScan} onError={handleError} />
		</div>
	</div>
{/if}
