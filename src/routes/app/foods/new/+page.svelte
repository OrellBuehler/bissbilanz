<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import FoodForm from '$lib/components/foods/FoodForm.svelte';

	const barcode = $derived($page.url.searchParams.get('barcode') ?? '');

	const handleSave = async (payload: any) => {
		await fetch('/api/foods', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		});
		goto('/app/foods');
	};
</script>

<div class="mx-auto max-w-lg space-y-6 p-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-semibold">New Food</h1>
		<a href="/app/foods" class="rounded border px-3 py-1 text-sm">Cancel</a>
	</div>
	{#if barcode}
		<p class="text-sm text-neutral-500">Barcode: {barcode}</p>
	{/if}
	<FoodForm initial={{ barcode }} onSave={handleSave} />
</div>
