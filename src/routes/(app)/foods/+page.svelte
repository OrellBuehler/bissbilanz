<script lang="ts">
	import { onMount } from 'svelte';
	import FoodForm from '$lib/components/foods/FoodForm.svelte';
	import FoodList from '$lib/components/foods/FoodList.svelte';
	import { filterFoods } from '$lib/components/foods/foodFilters';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { ResponsiveModal } from '$lib/components/ui/responsive-modal/index.js';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import { goto } from '$app/navigation';
	import { apiFetch } from '$lib/utils/api';
	import * as m from '$lib/paraglide/messages';

	let foods: Array<any> = $state([]);
	let query = $state('');
	let showNewFood = $state(false);

	const loadFoods = async () => {
		const res = await fetch('/api/foods');
		const data = await res.json();
		foods = data.foods;
	};

	const createFood = async (payload: any) => {
		await apiFetch('/api/foods', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		});
		showNewFood = false;
		await loadFoods();
	};

	const deleteFood = async (id: string) => {
		await apiFetch(`/api/foods/${id}`, { method: 'DELETE' });
		await loadFoods();
	};

	const enrichFood = async (id: string, barcode: string) => {
		const res = await fetch(`/api/openfoodfacts/${barcode}`);
		if (!res.ok) return;
		const { product } = await res.json();
		await apiFetch(`/api/foods/${id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				nutriScore: product.nutriScore,
				novaGroup: product.novaGroup,
				additives: product.additives,
				ingredientsText: product.ingredientsText,
				imageUrl: product.imageUrl
			})
		});
		await loadFoods();
	};

	onMount(() => {
		loadFoods();
	});

	const filtered = $derived(filterFoods(foods, query));
</script>

<div class="mx-auto max-w-2xl space-y-4 pb-4">
	<!-- Header -->
	<div class="flex flex-wrap items-start justify-between gap-2">
		<Button
			size="sm"
			class="shrink-0"
			aria-label={m.foods_new()}
			onclick={() => (showNewFood = true)}
		>
			<Plus class="size-4 sm:mr-1.5" />
			<span class="hidden sm:inline">{m.foods_new()}</span>
		</Button>
	</div>

	<!-- Search -->
	<div class="relative">
		<Search
			class="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
		/>
		<Input
			class="w-full min-w-0 pl-9"
			placeholder={m.foods_search_placeholder()}
			bind:value={query}
		/>
	</div>

	<!-- Food list -->
	{#if query && filtered.length === 0}
		<p class="py-8 text-center text-sm text-muted-foreground">{m.foods_no_results()}</p>
	{:else}
		<FoodList
			foods={filtered}
			onEdit={(id) => goto(`/foods/${id}`)}
			onDelete={deleteFood}
			onEnrich={enrichFood}
		/>
	{/if}
</div>

<!-- New food modal -->
<ResponsiveModal
	bind:open={showNewFood}
	title={m.foods_new()}
	description={m.foods_new_description()}
>
	<FoodForm
		onSave={createFood}
		onBarcodeScan={(barcode) => {
			showNewFood = false;
			goto(`/foods/new?barcode=${barcode}`);
		}}
	/>
</ResponsiveModal>
