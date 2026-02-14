<script lang="ts">
	import { onMount } from 'svelte';
	import FoodForm from '$lib/components/foods/FoodForm.svelte';
	import FoodList from '$lib/components/foods/FoodList.svelte';
	import { filterFoods } from '$lib/components/foods/foodFilters';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as m from '$lib/paraglide/messages';

	let foods: Array<any> = [];
	let query = '';

	const loadFoods = async () => {
		const res = await fetch('/api/foods');
		const data = await res.json();
		foods = data.foods;
	};

	const createFood = async (payload: any) => {
		await fetch('/api/foods', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		});
		await loadFoods();
	};

	const deleteFood = async (id: string) => {
		await fetch(`/api/foods/${id}`, { method: 'DELETE' });
		await loadFoods();
	};

	const enrichFood = async (id: string, barcode: string) => {
		const res = await fetch(`/api/openfoodfacts/${barcode}`);
		if (!res.ok) return;
		const { product } = await res.json();
		await fetch(`/api/foods/${id}`, {
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
</script>

<div class="mx-auto max-w-4xl space-y-6">
	<Input placeholder={m.foods_search_placeholder()} bind:value={query} />
	<FoodList foods={filterFoods(foods, query)} onEdit={() => {}} onDelete={deleteFood} onEnrich={enrichFood} />
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.foods_new()}</Card.Title>
		</Card.Header>
		<Card.Content>
			<FoodForm onSave={createFood} />
		</Card.Content>
	</Card.Root>
</div>
