<script lang="ts">
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
	<div class="rounded border p-4">
		<h2 class="mb-3 font-medium">Custom Meal Types</h2>
		<div class="flex gap-2">
			<input
				class="flex-1 rounded border p-2"
				placeholder="Add meal type"
				bind:value={newName}
				onkeydown={(e) => e.key === 'Enter' && addMealType()}
			/>
			<button class="rounded bg-black px-4 py-2 text-white" onclick={addMealType}>Add</button>
		</div>
		<ul class="mt-4 space-y-2">
			{#each mealTypes as meal}
				<li class="flex items-center justify-between rounded border p-2">
					<span>{meal.name}</span>
					<button
						class="rounded border px-3 py-1"
						onclick={() => removeMealType(meal.id)}
					>
						Remove
					</button>
				</li>
			{/each}
		</ul>
	</div>
</div>
