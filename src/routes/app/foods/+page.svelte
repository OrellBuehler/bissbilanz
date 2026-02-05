<script lang="ts">
	import FoodForm from '$lib/components/foods/FoodForm.svelte';
	import FoodList from '$lib/components/foods/FoodList.svelte';
	import { filterFoods } from '$lib/components/foods/foodFilters';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Card from '$lib/components/ui/card/index.js';

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

	loadFoods();
</script>

<div class="mx-auto max-w-4xl space-y-6 p-6">
	<h1 class="text-2xl font-semibold">Foods</h1>
	<Input placeholder="Search foods" bind:value={query} />
	<FoodList foods={filterFoods(foods, query)} onEdit={() => {}} onDelete={deleteFood} />
	<Card.Root>
		<Card.Header>
			<Card.Title>Add food</Card.Title>
		</Card.Header>
		<Card.Content>
			<FoodForm onSave={createFood} />
		</Card.Content>
	</Card.Root>
</div>
