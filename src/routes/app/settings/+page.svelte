<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Card from '$lib/components/ui/card/index.js';

	let mealTypes: Array<{ id: string; name: string; sortOrder: number }> = [];
	let newName = '';

	const loadMealTypes = async () => {
		const res = await fetch('/api/meal-types');
		mealTypes = (await res.json()).mealTypes;
	};

	const addMealType = async () => {
		if (!newName.trim()) return;
		await fetch('/api/meal-types', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name: newName, sortOrder: mealTypes.length + 1 })
		});
		newName = '';
		await loadMealTypes();
	};

	const removeMealType = async (id: string) => {
		await fetch(`/api/meal-types/${id}`, { method: 'DELETE' });
		await loadMealTypes();
	};

	loadMealTypes();
</script>

<div class="mx-auto max-w-2xl space-y-6 p-6">
	<h1 class="text-2xl font-semibold">Settings</h1>
	<Card.Root>
		<Card.Header>
			<Card.Title>Custom Meal Types</Card.Title>
		</Card.Header>
		<Card.Content class="space-y-4">
			<div class="flex gap-2">
				<Input
					class="flex-1"
					placeholder="Add meal type"
					bind:value={newName}
					onkeydown={(e) => e.key === 'Enter' && addMealType()}
				/>
				<Button onclick={addMealType}>Add</Button>
			</div>
			<ul class="space-y-2">
				{#each mealTypes as meal}
					<li class="flex items-center justify-between rounded-md border p-2">
						<span>{meal.name}</span>
						<Button variant="outline" size="sm" onclick={() => removeMealType(meal.id)}>
							Remove
						</Button>
					</li>
				{/each}
			</ul>
		</Card.Content>
	</Card.Root>
</div>
