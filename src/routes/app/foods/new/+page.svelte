<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import FoodForm from '$lib/components/foods/FoodForm.svelte';
	import FoodQualityPanel from '$lib/components/quality/FoodQualityPanel.svelte';
	import * as m from '$lib/paraglide/messages';

	const barcode = $derived($page.url.searchParams.get('barcode') ?? '');

	let offData = $state<any>(null);
	let offLoading = $state(false);
	let offNotFound = $state(false);

	async function fetchFromOFF(code: string) {
		if (!code) return;
		offLoading = true;
		offNotFound = false;
		try {
			const res = await fetch(`/api/openfoodfacts/${code}`);
			if (res.ok) {
				const json = await res.json();
				offData = json.product;
			} else {
				offNotFound = true;
			}
		} catch {
			offNotFound = true;
		} finally {
			offLoading = false;
		}
	}

	$effect(() => {
		if (barcode) {
			fetchFromOFF(barcode);
		}
	});

	const initialData = $derived(
		offData
			? {
					name: offData.name,
					brand: offData.brand,
					servingSize: offData.servingSize,
					servingUnit: offData.servingUnit,
					calories: offData.calories,
					protein: offData.protein,
					carbs: offData.carbs,
					fat: offData.fat,
					fiber: offData.fiber,
					sodium: offData.sodium,
					sugar: offData.sugar,
					saturatedFat: offData.saturatedFat,
					cholesterol: offData.cholesterol,
					barcode,
					isFavorite: false
				}
			: { barcode }
	);

	const qualityFields = $derived(
		offData
			? {
					nutriScore: offData.nutriScore,
					novaGroup: offData.novaGroup,
					additives: offData.additives,
					ingredientsText: offData.ingredientsText,
					imageUrl: offData.imageUrl
				}
			: null
	);

	const handleSave = async (payload: any) => {
		const body = qualityFields ? { ...payload, ...qualityFields } : payload;
		await fetch('/api/foods', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		goto('/app/foods');
	};
</script>

<div class="mx-auto max-w-lg space-y-6">
	<div class="flex items-center justify-end">
		<a href="/app/foods" class="rounded border px-3 py-1 text-sm">Cancel</a>
	</div>

	{#if offLoading}
		<p class="text-sm text-muted-foreground">{m.quality_off_loading()}</p>
	{:else if offNotFound && barcode}
		<p class="text-sm text-amber-600">{m.quality_off_not_found()}</p>
	{:else if offData}
		<p class="text-sm text-green-600">{m.quality_off_prefilled()}</p>
		<FoodQualityPanel
			nutriScore={offData.nutriScore}
			novaGroup={offData.novaGroup}
			additives={offData.additives}
			ingredientsText={offData.ingredientsText}
		/>
	{/if}

	{#if !offLoading}
		{#key offData}
			<FoodForm initial={initialData} onSave={handleSave} />
		{/key}
	{/if}
</div>
